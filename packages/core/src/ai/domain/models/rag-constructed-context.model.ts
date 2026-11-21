import { RAGEvidenceChunk } from './rag-evidence-chunk.model';

export interface CreateRAGConstructedContextProps {
  formattedContext: string;
  includedChunks: readonly RAGEvidenceChunk[];
  excludedChunks: readonly RAGEvidenceChunk[];
  totalContextTokens: number;
  evidenceTokens: number;
  historyTokens: number;
  systemPromptTokens: number;
  budgetRemaining: number;
  omittedChunkCount: number;
}

/**
 * Domain Model encapsulating the output of the RAG Context Builder.
 * Contains the untrusted formatted XML context ready for prompt insertion,
 * along with precise token accounting and lists of included and omitted evidence chunks.
 */
export class RAGConstructedContext {
  public readonly formattedContext: string;
  public readonly includedChunks: readonly RAGEvidenceChunk[];
  public readonly excludedChunks: readonly RAGEvidenceChunk[];
  public readonly totalContextTokens: number;
  public readonly evidenceTokens: number;
  public readonly historyTokens: number;
  public readonly systemPromptTokens: number;
  public readonly budgetRemaining: number;
  public readonly omittedChunkCount: number;

  private constructor(props: CreateRAGConstructedContextProps) {
    this.formattedContext = props.formattedContext;
    this.includedChunks = Object.freeze([...props.includedChunks]);
    this.excludedChunks = Object.freeze([...props.excludedChunks]);
    this.totalContextTokens = Math.max(0, props.totalContextTokens);
    this.evidenceTokens = Math.max(0, props.evidenceTokens);
    this.historyTokens = Math.max(0, props.historyTokens);
    this.systemPromptTokens = Math.max(0, props.systemPromptTokens);
    this.budgetRemaining = Math.max(0, props.budgetRemaining);
    this.omittedChunkCount = Math.max(0, props.omittedChunkCount);
    Object.freeze(this);
  }

  public static create(props: CreateRAGConstructedContextProps): RAGConstructedContext {
    return new RAGConstructedContext(props);
  }

  public static empty(systemPromptTokens = 0, maxBudget = 4096): RAGConstructedContext {
    return new RAGConstructedContext({
      formattedContext: '<retrieved_evidence>\n</retrieved_evidence>',
      includedChunks: Object.freeze([]),
      excludedChunks: Object.freeze([]),
      totalContextTokens: systemPromptTokens,
      evidenceTokens: 0,
      historyTokens: 0,
      systemPromptTokens,
      budgetRemaining: Math.max(0, maxBudget - systemPromptTokens),
      omittedChunkCount: 0,
    });
  }
}
