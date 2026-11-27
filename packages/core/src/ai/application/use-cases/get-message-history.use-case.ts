import { IAiConversationRepositoryPort } from '../../ports/outbound/ai-conversation-repository.port';
import { IAiConversationMessageRepositoryPort } from '../../ports/outbound/ai-conversation-message-repository.port';
import { IAiConversationCitationRepositoryPort } from '../../ports/outbound/ai-conversation-citation-repository.port';
import { AiConversationCitation } from '../../domain/models/ai-conversation-citation.entity';
import { ConversationRole } from '../../domain/enums/conversation-role.enum';
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
 * - Authoritative reconstruction of persisted citations (CIT.07) mapped to originating assistant messages.
 * - Stable citation ordering by citationPosition ASC.
 * - Safe fallback to legacy sources without altering historical answer text.
 */
export class GetMessageHistoryUseCase {
  constructor(
    private readonly convRepo: IAiConversationRepositoryPort,
    private readonly messageRepo: IAiConversationMessageRepositoryPort,
    private readonly citationRepo?: IAiConversationCitationRepositoryPort,
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

    if (input.userId && conv.userId !== input.userId.trim()) {
      throw new ConversationNotFoundError(conversationId, tenantId);
    }

    // 2. Fetch canonical history with sequence-based keyset pagination
    const historyResult = await this.messageRepo.listCanonicalHistory(tenantId, conversationId, {
      cursor: input.cursor,
      limit,
    });

    // 3. Batch-retrieve persisted citations for the conversation to associate with historical messages
    const citationsByMessageId = new Map<string, AiConversationCitation[]>();
    if (this.citationRepo) {
      try {
        const persistedCitations = await this.citationRepo.listByConversation(
          tenantId,
          conversationId,
        );
        for (const citation of persistedCitations) {
          const msgId = citation.messageId.value;
          const list = citationsByMessageId.get(msgId) ?? [];
          list.push(citation);
          citationsByMessageId.set(msgId, list);
        }
      } catch {
        // Fallback gracefully to message.sources on transient database or persistence errors
      }
    }

    const messages: MessageDto[] = historyResult.messages.map((m) => {
      let sources: Record<string, unknown>[] | null = null;

      if (m.role === ConversationRole.ASSISTANT) {
        const messageCitations = citationsByMessageId.get(m.id.value);
        if (messageCitations && messageCitations.length > 0) {
          // Stable ordering strictly by citationPosition ASC
          const sorted = [...messageCitations].sort(
            (a, b) => a.citationPosition - b.citationPosition,
          );
          sources = sorted.map((c) => ({
            citationId: c.id.value,
            documentId: c.documentId,
            documentTitle: c.documentTitleSnapshot,
            chunkId: c.chunkId ?? `chk_${c.id.value}`,
            excerpt: c.excerpt,
            pageNumber: c.pageNumber,
            headingPath: c.headingPath ? [...c.headingPath] : null,
            relevanceScore: c.relevanceScore ?? 1.0,
            retrievalRank: c.retrievalRank,
            sourceStrategy: c.sourceStrategy,
            documentVersionId: c.documentVersionId,
          }));
        } else if (m.sources && Array.isArray(m.sources) && m.sources.length > 0) {
          // Graceful fallback to legacy message.sources JSON if no relational citation rows exist
          sources = m.sources as Record<string, unknown>[];
        }
      }

      return {
        id: m.id.value,
        turnId: m.turnId.value,
        role: m.role,
        sequenceNumber: m.sequenceNumber,
        attemptNumber: m.attemptNumber,
        isCanonical: m.isCanonical,
        status: m.status,
        content: m.content,
        sources,
        metadata: m.metadata ? { ...m.metadata } : null,
        createdAt: m.createdAt.toISOString(),
        completedAt: m.completedAt ? m.completedAt.toISOString() : null,
      };
    });

    return {
      messages,
      nextCursor: historyResult.nextCursor ? historyResult.nextCursor.encode() : null,
      hasMore: historyResult.hasMore ?? false,
    };
  }
}
