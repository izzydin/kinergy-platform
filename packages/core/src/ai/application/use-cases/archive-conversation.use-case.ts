import { IAiConversationRepositoryPort } from '../../ports/outbound/ai-conversation-repository.port';
import { IAiConversationTurnRepositoryPort } from '../../ports/outbound/ai-conversation-turn-repository.port';
import { ArchiveConversationInput, ArchiveConversationResult } from '../dtos/ai-conversation.dtos';
import {
  InvalidTurnInputError,
  ConversationNotFoundError,
  InvalidConversationLifecycleError,
  TurnAlreadyInProgressError,
} from '../errors/ai-conversation-application.error';

/**
 * Use case to safely archive (soft-delete) an AI conversation.
 *
 * Guarantees:
 * - Verifies conversation exists within tenant boundary.
 * - Prevents re-archiving an already archived conversation.
 * - Enforces that no assistant generation is actively in progress before archiving.
 * - Independent retention of audit logs (audit records are never deleted).
 */
export class ArchiveConversationUseCase {
  constructor(
    private readonly convRepo: IAiConversationRepositoryPort,
    private readonly turnRepo: IAiConversationTurnRepositoryPort,
  ) {}

  public async execute(input: ArchiveConversationInput): Promise<ArchiveConversationResult> {
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

    const tenantId = input.tenantId.trim();
    const conversationId = input.conversationId.trim();

    // 1. Verify conversation exists
    const conv = await this.convRepo.findById(tenantId, conversationId);
    if (!conv) {
      throw new ConversationNotFoundError(conversationId, tenantId);
    }

    // 2. Prevent re-archiving
    if (conv.isArchived()) {
      throw new InvalidConversationLifecycleError(
        conversationId,
        'Conversation is already archived.',
      );
    }

    // 3. Prevent archiving while a generation is actively in progress
    if (this.turnRepo.findActiveTurn) {
      const activeTurn = await this.turnRepo.findActiveTurn(tenantId, conversationId);
      if (activeTurn) {
        throw new TurnAlreadyInProgressError(conversationId, activeTurn.id.value);
      }
    }

    // 4. Perform soft-delete
    if (this.convRepo.softDelete) {
      await this.convRepo.softDelete(tenantId, conversationId);
      conv.archive();
    } else if (this.convRepo.updateMetadata) {
      await this.convRepo.updateMetadata(tenantId, conversationId, {
        isArchived: true,
      });
      conv.archive();
    } else {
      conv.archive();
      await this.convRepo.save(conv);
    }

    return {
      conversationId: conv.id.value,
      isArchived: true,
      archivedAt: conv.deletedAt ? conv.deletedAt.toISOString() : new Date().toISOString(),
    };
  }
}
