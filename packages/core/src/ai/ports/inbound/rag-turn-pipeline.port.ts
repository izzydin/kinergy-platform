import { ChatMessage } from '../../domain/value-objects/chat-message.vo';
import { RAGSourceCitation } from '../../domain/value-objects/rag-source-citation.vo';
import { RetrievalSearchMode } from '../../domain/enums/retrieval-search-mode.enum';

export const RAG_TURN_PIPELINE_PORT = Symbol('IRAGTurnPipelinePort');

export type RAGTurnExecutionOutcome = 'SUCCESS' | 'ABSTAINED' | 'FAILED' | 'CANCELLED';

/**
 * Execution configuration for RAG retrieval and context construction.
 */
export interface RAGTurnExecutionConfig {
  readonly searchMode?: RetrievalSearchMode;
  readonly topK?: number;
  readonly minSimilarity?: number;
  readonly documentIds?: readonly string[];
  readonly maxTokens?: number;
  readonly maxHistoryTurns?: number;
}

/**
 * Input command passed from the conversation turn coordinator to the RAG pipeline.
 *
 * Communicates the minimum required information without leaking database transaction
 * objects, internal lease tokens, or persistence primitives to AI-08.
 */
export interface RAGTurnExecutionCommand {
  readonly tenantId: string;
  readonly conversationId: string;
  readonly turnId: string;
  readonly userMessageId: string;
  readonly userPrompt: string;
  readonly canonicalHistory: readonly ChatMessage[];
  readonly attemptId: string;
  readonly attemptNumber: number;
  readonly executionConfig?: RAGTurnExecutionConfig;
  readonly signal?: AbortSignal;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly actorContext: {
    readonly userId: string;
    readonly roles: readonly string[];
    readonly permissions: readonly string[];
  };
}

/**
 * Result returned by the RAG pipeline to the conversation turn coordinator.
 */
export interface RAGTurnExecutionResult {
  readonly outcome: RAGTurnExecutionOutcome;
  readonly content: string;
  readonly isGrounded: boolean;
  readonly sources: readonly RAGSourceCitation[];
  readonly metadata: Readonly<{
    model: string;
    retrievalCount: number;
    latencyMs: number;
    finishReason?: string;
    [key: string]: unknown;
  }>;
  readonly errorCode?: string | null;
  readonly errorMessage?: string | null;
}

/**
 * Strongly typed integration boundary between AI-09.3 conversation management
 * and AI-08 RAG grounded generation orchestration.
 */
export interface IRAGTurnPipelinePort {
  executeTurn(command: RAGTurnExecutionCommand): Promise<RAGTurnExecutionResult>;
}
