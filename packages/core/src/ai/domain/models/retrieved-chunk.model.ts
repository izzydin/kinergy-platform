import { ChunkId } from '../value-objects/chunk-id.vo';
import { SimilarityScore } from '../value-objects/similarity-score.vo';
import { RetrievalProvenance } from '../value-objects/retrieval-provenance.vo';
import { InvalidRetrievalQueryException } from '../exceptions/retrieval.exceptions';
import { RetrievalErrorCode } from '../enums/retrieval-error-code.enum';

export interface CreateRetrievedChunkProps {
  id: string;
  chunkId: ChunkId | string;
  documentId: string;
  documentVersionId: string;
  indexGenerationId: string;
  content: string;
  tokenCount: number;
  similarity: SimilarityScore | number;
  distance: number;
  provenance: RetrievalProvenance;
  metadata?: Record<string, unknown>;
}

/**
 * Domain Model representing a fully hydrated knowledge chunk retrieved
 * via semantic vector similarity search.
 *
 * Encapsulates the chunk text, similarity score, distance metric, token count,
 * and provenance citation details.
 */
export class RetrievedChunk {
  public readonly id: string;
  public readonly chunkId: ChunkId;
  public readonly documentId: string;
  public readonly documentVersionId: string;
  public readonly indexGenerationId: string;
  public readonly content: string;
  public readonly tokenCount: number;
  public readonly similarity: SimilarityScore;
  public readonly distance: number;
  public readonly provenance: RetrievalProvenance;
  public readonly metadata?: Readonly<Record<string, unknown>>;

  private constructor(props: {
    id: string;
    chunkId: ChunkId;
    documentId: string;
    documentVersionId: string;
    indexGenerationId: string;
    content: string;
    tokenCount: number;
    similarity: SimilarityScore;
    distance: number;
    provenance: RetrievalProvenance;
    metadata?: Readonly<Record<string, unknown>>;
  }) {
    this.id = props.id;
    this.chunkId = props.chunkId;
    this.documentId = props.documentId;
    this.documentVersionId = props.documentVersionId;
    this.indexGenerationId = props.indexGenerationId;
    this.content = props.content;
    this.tokenCount = props.tokenCount;
    this.similarity = props.similarity;
    this.distance = props.distance;
    this.provenance = props.provenance;
    this.metadata = props.metadata;
    Object.freeze(this);
  }

  public static create(props: CreateRetrievedChunkProps): RetrievedChunk {
    if (!props.id || typeof props.id !== 'string') {
      throw new InvalidRetrievalQueryException(
        'RetrievedChunk requires a valid string id.',
        RetrievalErrorCode.RETRIEVAL_PERSISTENCE_ERROR,
      );
    }

    const chunkId =
      props.chunkId instanceof ChunkId ? props.chunkId : ChunkId.fromString(props.chunkId);

    if (!props.content || typeof props.content !== 'string' || props.content.trim().length === 0) {
      throw new InvalidRetrievalQueryException(
        'RetrievedChunk content cannot be empty.',
        RetrievalErrorCode.RETRIEVAL_PERSISTENCE_ERROR,
      );
    }

    if (!Number.isInteger(props.tokenCount) || props.tokenCount < 0) {
      throw new InvalidRetrievalQueryException(
        `RetrievedChunk tokenCount must be a non-negative integer, received: ${props.tokenCount}`,
        RetrievalErrorCode.RETRIEVAL_PERSISTENCE_ERROR,
      );
    }

    const similarity =
      props.similarity instanceof SimilarityScore
        ? props.similarity
        : SimilarityScore.create(props.similarity);

    if (typeof props.distance !== 'number' || !Number.isFinite(props.distance)) {
      throw new InvalidRetrievalQueryException(
        `RetrievedChunk distance must be a finite number, received: ${props.distance}`,
        RetrievalErrorCode.INVALID_SIMILARITY_SCORE,
      );
    }

    if (!props.provenance || !(props.provenance instanceof RetrievalProvenance)) {
      throw new InvalidRetrievalQueryException(
        'RetrievedChunk requires a valid RetrievalProvenance instance.',
        RetrievalErrorCode.RETRIEVAL_PERSISTENCE_ERROR,
      );
    }

    return new RetrievedChunk({
      id: props.id.trim(),
      chunkId,
      documentId: props.documentId.trim(),
      documentVersionId: props.documentVersionId.trim(),
      indexGenerationId: props.indexGenerationId.trim(),
      content: props.content,
      tokenCount: props.tokenCount,
      similarity,
      distance: props.distance,
      provenance: props.provenance,
      metadata: props.metadata ? Object.freeze({ ...props.metadata }) : undefined,
    });
  }
}
