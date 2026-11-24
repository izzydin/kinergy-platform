import { IAiConversationRepositoryPort } from '../../ports/outbound/ai-conversation-repository.port';
import { IAiConversationMessageRepositoryPort } from '../../ports/outbound/ai-conversation-message-repository.port';
import {
  GetMessageHistoryInput,
  MessageHistoryResultDto,
  MessageDto,
} from '../dtos/ai-conversation.dtos';
import {
  InvalidTurnInputError,
  ConversationNotFoundError,
} from '../errors/ai-conversation-application.error';

/**
 * Use case to retrieve the canonical message history of a conversation.
 *
 * Guarantees:
 * - Keyset-based pagination ordered strictly by immutable sequence `(sequenceNumber ASC, id ASC)`.
 * - Preflight tenant-scoped conversation existence check.
 * - Snapshot-consistent iteration through message history.
 * - Bounded page sizes (default 20, max 100).
 */
export class GetMessageHistoryUseCase {
  constructor(
    private readonly convRepo: IAiConversationRepositoryPort,
    private readonly messageRepo: IAiConversationMessageRepositoryPort,
  ) {}

  public async execute(input: GetMessageHistoryInput): Promise<MessageHistoryResultDto> {
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
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);

    // 1. Verify conversation exists within tenant boundary
    const conv = await this.convRepo.findById(tenantId, conversationId);
    if (!conv) {
      throw new ConversationNotFoundError(conversationId, tenantId);
    }

    // 2. Fetch canonical history with sequence-based keyset pagination
    const historyResult = await this.messageRepo.listCanonicalHistory(tenantId, conversationId, {
      cursor: input.cursor,
      limit,
    });

    const messages: MessageDto[] = historyResult.messages.map((m) => ({
      id: m.id.value,
      turnId: m.turnId.value,
      role: m.role,
      sequenceNumber: m.sequenceNumber,
      attemptNumber: m.attemptNumber,
      isCanonical: m.isCanonical,
      status: m.status,
      content: m.content,
      sources: m.sources,
      metadata: m.metadata ? { ...m.metadata } : null,
      createdAt: m.createdAt.toISOString(),
      completedAt: m.completedAt ? m.completedAt.toISOString() : null,
    }));

    return {
      messages,
      nextCursor: historyResult.nextCursor ? historyResult.nextCursor.encode() : null,
      hasMore: historyResult.hasMore ?? false,
    };
  }
}
