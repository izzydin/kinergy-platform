import { RetrievedChunk } from './retrieved-chunk.model';
import { RetrievalQuery } from '../value-objects/retrieval-query.vo';
import { SimilarityScore } from '../value-objects/similarity-score.vo';
import {
  SemanticRetrievalResponse,
  SemanticRetrievalResponseOptions,
} from './retrieval-response.model';

export interface CreateRetrievalResultProps {
  query: RetrievalQuery;
  chunks: readonly RetrievedChunk[];
  totalMatches: number;
  activeGenerationId: string;
  executionDurationMs: number;
  embeddingDurationMs?: number;
  searchDurationMs?: number;
}

/**
 * Domain Aggregate / Model encapsulating the outcome of an authorized semantic retrieval operation.
 */
export class RetrievalResult {
  public readonly query: RetrievalQuery;
  public readonly chunks: readonly RetrievedChunk[];
  public readonly totalMatches: number;
  public readonly activeGenerationId: string;
  public readonly executionDurationMs: number;
  public readonly embeddingDurationMs?: number;
  public readonly searchDurationMs?: number;

  private constructor(props: {
    query: RetrievalQuery;
    chunks: readonly RetrievedChunk[];
    totalMatches: number;
    activeGenerationId: string;
    executionDurationMs: number;
    embeddingDurationMs?: number;
    searchDurationMs?: number;
  }) {
    this.query = props.query;
    this.chunks = props.chunks;
    this.totalMatches = props.totalMatches;
    this.activeGenerationId = props.activeGenerationId;
    this.executionDurationMs = props.executionDurationMs;
    this.embeddingDurationMs = props.embeddingDurationMs;
    this.searchDurationMs = props.searchDurationMs;
    Object.freeze(this);
  }

  public static create(props: CreateRetrievalResultProps): RetrievalResult {
    return new RetrievalResult({
      query: props.query,
      chunks: Object.freeze([...props.chunks]),
      totalMatches: Math.max(0, props.totalMatches),
      activeGenerationId: props.activeGenerationId.trim(),
      executionDurationMs: Math.max(0, props.executionDurationMs),
      embeddingDurationMs: props.embeddingDurationMs,
      searchDurationMs: props.searchDurationMs,
    });
  }

  public static empty(
    query: RetrievalQuery,
    activeGenerationId: string,
    durationMs = 0,
  ): RetrievalResult {
    return new RetrievalResult({
      query,
      chunks: Object.freeze([]),
      totalMatches: 0,
      activeGenerationId,
      executionDurationMs: durationMs,
    });
  }

  public get count(): number {
    return this.chunks.length;
  }

  public isEmpty(): boolean {
    return this.chunks.length === 0;
  }

  public topMatch(): RetrievedChunk | null {
    return this.chunks.length > 0 ? (this.chunks[0] ?? null) : null;
  }

  /**
   * Filters the retrieved chunks further by an explicit similarity threshold.
   */
  public filterByMinSimilarity(minScore: SimilarityScore | number): RetrievalResult {
    const threshold =
      minScore instanceof SimilarityScore ? minScore : SimilarityScore.create(minScore);
    const filtered = this.chunks.filter((c) => c.similarity.meetsThreshold(threshold));
    return new RetrievalResult({
      query: this.query,
      chunks: Object.freeze(filtered),
      totalMatches: filtered.length,
      activeGenerationId: this.activeGenerationId,
      executionDurationMs: this.executionDurationMs,
      embeddingDurationMs: this.embeddingDurationMs,
      searchDurationMs: this.searchDurationMs,
    });
  }

  /**
   * Formats this domain retrieval result into a production-grade, typed client response.
   */
  public toResponse(options?: SemanticRetrievalResponseOptions): SemanticRetrievalResponse {
    return SemanticRetrievalResponse.fromResult(this, options);
  }
}
