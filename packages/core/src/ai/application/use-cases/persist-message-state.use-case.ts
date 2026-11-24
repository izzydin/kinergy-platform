import { IAiConversationMessageRepositoryPort } from '../../ports/outbound/ai-conversation-message-repository.port';
import { PersistMessageStateInput, PersistMessageStateResult } from '../dtos/ai-conversation.dtos';
import {
  InvalidTurnInputError,
  MessageNotFoundError,
  InvalidMessageOperationError,
} from '../errors/ai-conversation-application.error';
import { ConversationRole } from '../../domain/enums/conversation-role.enum';
import { GenerationStatus } from '../../domain/enums/generation-status.enum';

/**
 * Use case to persist approved state transitions, streaming output, or completion
 * status for an assistant message or attempt.
 *
 * Guarantees:
 * - Identity and sequence immutability: role, sequenceNumber, turnId, conversationId, tenantId cannot be altered.
 * - Protects user messages from invalid status mutations (USER role must remain SUCCESS, attempt 1, non-canonical).
 * - Enforces that canonical designation requires SUCCESS status.
 */
export class PersistMessageStateUseCase {
  constructor(private readonly messageRepo: IAiConversationMessageRepositoryPort) {}

  public async execute(input: PersistMessageStateInput): Promise<PersistMessageStateResult> {
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

    if (
      !input.messageId ||
      typeof input.messageId !== 'string' ||
      input.messageId.trim().length === 0
    ) {
      throw new InvalidTurnInputError('messageId', 'Message ID is required.');
    }

    const tenantId = input.tenantId.trim();
    const conversationId = input.conversationId.trim();
    const messageId = input.messageId.trim();

    // 1. Verify message exists
    const message = await this.messageRepo.findById(tenantId, conversationId, messageId);
    if (!message) {
      throw new MessageNotFoundError(messageId, undefined, conversationId);
    }

    // 2. Protect USER role messages from invalid mutations
    if (message.role === ConversationRole.USER) {
      if (input.status !== GenerationStatus.SUCCESS) {
        throw new InvalidMessageOperationError(
          messageId,
          'User messages cannot transition out of SUCCESS status.',
        );
      }
      if (input.isCanonical === true) {
        throw new InvalidMessageOperationError(
          messageId,
          'User messages cannot be designated as canonical.',
        );
      }
    }

    // 3. Enforce canonical designation invariants
    if (input.isCanonical === true && input.status !== GenerationStatus.SUCCESS) {
      throw new InvalidMessageOperationError(
        messageId,
        `Cannot designate message '${messageId}' as canonical with non-SUCCESS status '${input.status}'.`,
      );
    }

    // 4. Update status and output
    if (!this.messageRepo.updateStatus) {
      throw new InvalidMessageOperationError(
        messageId,
        'Repository does not support updateStatus operation.',
      );
    }

    const updated = await this.messageRepo.updateStatus(tenantId, conversationId, messageId, {
      status: input.status,
      content: input.content,
      isCanonical: input.isCanonical,
      completedAt: input.completedAt,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
      sources: input.sources,
      metadata: input.metadata,
    });

    return {
      messageId: updated.id.value,
      status: updated.status,
      isCanonical: updated.isCanonical,
      completedAt: updated.completedAt ? updated.completedAt.toISOString() : null,
      updatedAt: updated.updatedAt.toISOString(),
    };
  }
}
