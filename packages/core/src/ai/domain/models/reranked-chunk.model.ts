import { RetrievedChunk } from './retrieved-chunk.model';
import { SimilarityScore } from '../value-objects/similarity-score.vo';

export interface CreateRerankedChunkProps {
  readonly chunk: RetrievedChunk;
  readonly rerankerScore: number;
  readonly originalRank: number;
  readonly finalRank: number;
}

/**
 * Domain model representing the result of a cross-encoder reranking operation
 * performed on an authorized, pre-filtered retrieval candidate chunk.
 *
 * Invariants:
 * - Preserves the underlying RetrievedChunk and its complete provenance.
 * - Retains the original RRF rank and original similarity scores without mutation.
 * - Stores the raw cross-encoder relevance score (typically logit or sigmoid probability).
 * - Enforces immutable value semantics.
 */
export class RerankedChunk {
  public readonly chunk: RetrievedChunk;
  public readonly rerankerScore: number;
  public readonly originalRank: number;
  public readonly finalRank: number;

  private constructor(props: CreateRerankedChunkProps) {
    this.chunk = props.chunk;
    this.rerankerScore = props.rerankerScore;
    this.originalRank = props.originalRank;
    this.finalRank = props.finalRank;
    Object.freeze(this);
  }

  public static create(props: CreateRerankedChunkProps): RerankedChunk {
    if (typeof props.rerankerScore !== 'number' || !Number.isFinite(props.rerankerScore)) {
      throw new Error(`Reranker score must be a finite number, received: ${props.rerankerScore}`);
    }
    if (props.originalRank < 1) {
      throw new Error(`Original rank must be >= 1, received: ${props.originalRank}`);
    }
    if (props.finalRank < 1) {
      throw new Error(`Final rank must be >= 1, received: ${props.finalRank}`);
    }
    return new RerankedChunk(props);
  }

  /**
   * Projects this reranked candidate back into a domain RetrievedChunk entity,
   * enriching its metadata with complete reranking telemetry while preserving
   * the original RRF and vector similarity scores in metadata.
   */
  public toRetrievedChunk(): RetrievedChunk {
    const rawRerankerScore = this.rerankerScore;
    // Normalized score in [0.0, 1.0] for domain SimilarityScore compatibility
    const normalizedScore = Math.max(0.0, Math.min(1.0, rawRerankerScore));
    const roundedScore = Math.round(normalizedScore * 1000000) / 1000000;

    const updatedMetadata: Record<string, unknown> = {
      ...(this.chunk.metadata || {}),
      originalSimilarity: this.chunk.similarity.value,
      originalRrfRank: this.originalRank,
      finalRerankedRank: this.finalRank,
      rawRerankerScore: Math.round(rawRerankerScore * 1000000) / 1000000,
      retrievalStrategy: 'HYBRID_RERANKED',
    };

    return RetrievedChunk.create({
      id: this.chunk.id,
      chunkId: this.chunk.chunkId,
      documentId: this.chunk.documentId,
      documentVersionId: this.chunk.documentVersionId,
      indexGenerationId: this.chunk.indexGenerationId,
      content: this.chunk.content,
      tokenCount: this.chunk.tokenCount,
      similarity: SimilarityScore.create(roundedScore),
      distance: Math.max(0.0, Math.min(1.0, 1.0 - roundedScore)),
      provenance: this.chunk.provenance,
      metadata: updatedMetadata,
    });
  }
}
