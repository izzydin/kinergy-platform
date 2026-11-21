import { RetrievalAuthContext } from './semantic-search.use-case';
import { RetrievalSearchMode } from '../../domain/enums/retrieval-search-mode.enum';
import { ChatMessage } from '../../domain/value-objects/chat-message.vo';
import { RAGAnswer } from '../../domain/models/rag-answer.model';

export const GENERATE_GROUNDED_ANSWER_USE_CASE_PORT = Symbol('IGenerateGroundedAnswerUseCase');

/**
 * Input command for Grounded Answer Generation.
 */
export interface GenerateGroundedAnswerCommand {
  readonly query: string;
  readonly authContext: RetrievalAuthContext;
  readonly conversationId?: string;
  readonly conversationHistory?: readonly ChatMessage[];
  readonly searchMode?: RetrievalSearchMode;
  readonly topK?: number;
  readonly minSimilarity?: number;
  readonly documentIds?: string[];
  readonly signal?: AbortSignal;
  readonly requestId?: string;
  readonly correlationId?: string;
}

/**
 * Inbound application use case port for RAG-grounded answer generation.
 */
export interface IGenerateGroundedAnswerUseCase {
  execute(command: GenerateGroundedAnswerCommand): Promise<RAGAnswer>;
}
