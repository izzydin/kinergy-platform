import { RetrievedChunk } from '../../domain/models/retrieved-chunk.model';
import { RAGEvidenceChunk } from '../../domain/models/rag-evidence-chunk.model';
import { RAGConstructedContext } from '../../domain/models/rag-constructed-context.model';
import { ChatMessage } from '../../domain/value-objects/chat-message.vo';

export const RAG_CONTEXT_BUILDER_PORT = Symbol('IRAGContextBuilderPort');

/**
 * Options controlling token allocation, safety margins, and untrusted delimiter escaping.
 */
export interface ContextBudgetOptions {
  /** Maximum total context budget (e.g. 4096 for Qwen 3 4B via Ollama). Defaults to 4096. */
  maxTotalContextTokens?: number;

  /** Ceiling on tokens allocated specifically to retrieved knowledge chunks. Defaults to 2200. */
  maxEvidenceTokens?: number;

  /** Ceiling on tokens allocated to conversational message history. Defaults to 500. */
  maxHistoryTokens?: number;

  /** Estimated tokens consumed by the static system prompt and grounding rules. Defaults to 450. */
  systemPromptEstimatedTokens?: number;

  /** Reserved tokens for model generation (num_predict). Defaults to 512. */
  reservedCompletionTokens?: number;

  /** Safety buffer to prevent prompt overflows under token estimator variance. Defaults to 200. */
  safetyMarginTokens?: number;

  /** Whether to sanitize closing XML boundary tags found inside untrusted chunk text. Defaults to true. */
  escapeUntrustedDelimiters?: boolean;
}

/**
 * Input command for the RAG Context Builder.
 */
export interface BuildContextCommand {
  readonly query: string;
  readonly evidenceChunks: readonly (RetrievedChunk | RAGEvidenceChunk)[];
  readonly conversationHistory?: readonly ChatMessage[];
  readonly options?: ContextBudgetOptions;
}

/**
 * Inbound port contract for deterministic context construction and token budgeting.
 */
export interface IRAGContextBuilderPort {
  buildContext(command: BuildContextCommand): Promise<RAGConstructedContext>;
}
