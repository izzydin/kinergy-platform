import { ConversationSession } from '../../domain/models/conversation-session.model';

export const CONVERSATION_REPOSITORY_PORT = Symbol('IConversationRepositoryPort');

/**
 * Outbound port for persistent or in-memory storage of multi-turn conversation sessions.
 * Guarantees tenant-isolated operations on conversation entities.
 */
export interface IConversationRepositoryPort {
  findById(id: string, tenantId: string): Promise<ConversationSession | null>;
  save(session: ConversationSession): Promise<void>;
  delete(id: string, tenantId: string): Promise<void>;
  listByUser(tenantId: string, userId: string, limit?: number): Promise<ConversationSession[]>;
}
