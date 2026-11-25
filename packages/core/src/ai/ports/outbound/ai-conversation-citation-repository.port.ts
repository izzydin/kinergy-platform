import { AiConversationCitation } from '../../domain/models/ai-conversation-citation.entity';
import { CitationId } from '../../domain/value-objects/citation-id.vo';
import { MessageId } from '../../domain/value-objects/message-id.vo';
import { ConversationId } from '../../domain/value-objects/conversation-id.vo';

export const AI_CONVERSATION_CITATION_REPOSITORY_PORT = Symbol(
  'IAiConversationCitationRepositoryPort',
);

/**
 * Outbound port for persistent storage and retrieval of assistant message citations.
 *
 * Guarantees:
 * - Enforces tenant, conversation, and message ownership boundaries.
 * - Deterministic retrieval ordered strictly by citationPosition ascending.
 * - Backed by PostgreSQL composite foreign keys and unique constraints.
 */
export interface IAiConversationCitationRepositoryPort {
  /**
   * Persists a single citation record.
   */
  save(citation: AiConversationCitation): Promise<AiConversationCitation>;

  /**
   * Persists multiple citation records in a single batch.
   */
  saveMany(citations: readonly AiConversationCitation[]): Promise<AiConversationCitation[]>;

  /**
   * Retrieves a citation by its tenant, conversation, message, and citation ID.
   */
  findById(
    tenantId: string,
    conversationId: ConversationId | string,
    messageId: MessageId | string,
    citationId: CitationId | string,
  ): Promise<AiConversationCitation | null>;

  /**
   * Lists all citations for an assistant message, ordered by citationPosition ASC.
   */
  listByMessage(
    tenantId: string,
    conversationId: ConversationId | string,
    messageId: MessageId | string,
  ): Promise<AiConversationCitation[]>;

  /**
   * Lists all citations across all messages in a conversation, ordered chronologically and by position.
   */
  listByConversation(
    tenantId: string,
    conversationId: ConversationId | string,
  ): Promise<AiConversationCitation[]>;

  /**
   * Deletes all citations for a specific message.
   */
  deleteByMessage(
    tenantId: string,
    conversationId: ConversationId | string,
    messageId: MessageId | string,
  ): Promise<number>;
}
