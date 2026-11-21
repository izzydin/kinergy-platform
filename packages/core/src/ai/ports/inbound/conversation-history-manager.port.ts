import { ChatMessage } from '../../domain/value-objects/chat-message.vo';
import { ConversationSession } from '../../domain/models/conversation-session.model';
import { RetrievalAuthContext } from './semantic-search.use-case';

export const CONVERSATION_HISTORY_MANAGER_PORT = Symbol('IConversationHistoryManagerPort');

export interface ResolveHistoryCommand {
  readonly authContext: RetrievalAuthContext;
  readonly query: string;
  readonly conversationId?: string;
  readonly clientHistory?: readonly ChatMessage[];
  readonly maxTurns?: number;
  readonly maxTokens?: number;
}

export interface ResolvedHistoryResult {
  readonly session?: ConversationSession;
  readonly boundedHistory: ChatMessage[];
  readonly historyTokens: number;
  readonly turnCount: number;
  readonly isFollowUp: boolean;
}

export interface RecordTurnCommand {
  readonly tenantId: string;
  readonly userId: string;
  readonly conversationId: string;
  readonly query: string;
  readonly answer: string;
}

/**
 * Inbound port contract for conversation history resolution, authorization verification,
 * token budgeting, and follow-up identification.
 */
export interface IConversationHistoryManagerPort {
  resolveHistory(command: ResolveHistoryCommand): Promise<ResolvedHistoryResult>;
  recordTurn(command: RecordTurnCommand): Promise<void>;
}
