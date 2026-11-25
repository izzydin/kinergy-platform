import { AiMessageFeedback } from '../../domain/models/ai-message-feedback.entity';

export const AI_MESSAGE_FEEDBACK_REPOSITORY_PORT = Symbol('IAiMessageFeedbackRepositoryPort');

/**
 * Outbound port for persisting and retrieving user feedback on assistant messages.
 *
 * Guarantees:
 * - Scoped strictly to tenant, conversation, and user identity boundaries.
 * - Idempotent upsert behavior on duplicate (messageId, userId) submissions.
 * - Enforces referential integrity with cascading conversation and message deletion.
 */
export interface IAiMessageFeedbackRepositoryPort {
  /**
   * Persists a feedback record (insert or update).
   */
  save(feedback: AiMessageFeedback): Promise<AiMessageFeedback>;

  /**
   * Retrieves feedback submitted by a specific user for a given message.
   */
  findByMessageAndUser(
    tenantId: string,
    conversationId: string,
    messageId: string,
    userId: string,
  ): Promise<AiMessageFeedback | null>;

  /**
   * Retrieves feedback by its unique identifier.
   */
  findById(tenantId: string, feedbackId: string): Promise<AiMessageFeedback | null>;

  /**
   * Deletes a feedback record by message and user.
   */
  deleteByMessageAndUser(
    tenantId: string,
    conversationId: string,
    messageId: string,
    userId: string,
  ): Promise<boolean>;

  /**
   * Lists all feedback records for a conversation.
   */
  listByConversation(
    tenantId: string,
    conversationId: string,
  ): Promise<readonly AiMessageFeedback[]>;
}
