import { IAiConversationRepositoryPort } from '../../ports/outbound/ai-conversation-repository.port';
import {
  UpdateConversationTitleInput,
  UpdateConversationTitleResult,
} from '../dtos/ai-conversation.dtos';
import {
  InvalidTurnInputError,
  ConversationNotFoundError,
  InvalidConversationLifecycleError,
} from '../errors/ai-conversation-application.error';
import { ConversationTitle } from '../../domain/value-objects/conversation-title.vo';
import { AiConversation } from '../../domain/models/ai-conversation.entity';

/**
 * Use case to update the title of an active conversation.
 *
 * Guarantees:
 * - Explicit domain validation of the new title (1-255 characters, non-empty).
 * - Tenant ownership enforcement.
 * - Prohibits title updates on soft-deleted/archived conversations.
 */
export class UpdateConversationTitleUseCase {
  constructor(private readonly convRepo: IAiConversationRepositoryPort) {}

  public async execute(
    input: UpdateConversationTitleInput,
  ): Promise<UpdateConversationTitleResult> {
    if (
      !input.tenantId ||
      typeof input.tenantId !== 'string' ||
      input.tenantId.trim().length === 0
    ) {
      throw new InvalidTurnInputError('tenantId', 'Tenant ID is required.');
    }

    if (
      !input.conversationId ||
      typeof input.conversationId !== 'string' ||
      input.conversationId.trim().length === 0
    ) {
      throw new InvalidTurnInputError('conversationId', 'Conversation ID is required.');
    }

    if (!input.title || typeof input.title !== 'string' || input.title.trim().length === 0) {
      throw new InvalidTurnInputError('title', 'Conversation title cannot be empty.');
    }

    const tenantId = input.tenantId.trim();
    const conversationId = input.conversationId.trim();

    // 1. Validate title value object invariants
    let titleVo: ConversationTitle;
    try {
      titleVo = ConversationTitle.create(input.title.trim());
    } catch (err) {
      throw new InvalidTurnInputError(
        'title',
        err instanceof Error ? err.message : 'Invalid conversation title',
      );
    }

    // 2. Verify conversation exists and is not archived
    const conv = await this.convRepo.findById(tenantId, conversationId);
    if (!conv) {
      throw new ConversationNotFoundError(conversationId, tenantId);
    }

    if (input.userId && conv.userId !== input.userId.trim()) {
      throw new ConversationNotFoundError(conversationId, tenantId);
    }

    if (conv.isArchived()) {
      throw new InvalidConversationLifecycleError(
        conversationId,
        'Cannot update title of an archived conversation.',
      );
    }

    // 3. Persist update
    let updated: AiConversation;
    if (this.convRepo.updateMetadata) {
      updated = await this.convRepo.updateMetadata(tenantId, conversationId, {
        title: titleVo,
      });
    } else {
      conv.updateTitle(titleVo);
      updated = await this.convRepo.save(conv);
    }

    return {
      conversationId: updated.id.value,
      title: updated.title.value,
      updatedAt: updated.updatedAt.toISOString(),
    };
  }
}
