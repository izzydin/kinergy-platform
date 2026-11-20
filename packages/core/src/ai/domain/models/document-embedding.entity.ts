import { EmbeddingId } from '../value-objects/embedding-id.vo';
import { ChunkId } from '../value-objects/chunk-id.vo';
import { IndexGenerationId } from '../value-objects/index-generation-id.vo';
import { VectorValues } from '../value-objects/vector-values.vo';
import { EmbeddingProfile } from '../value-objects/embedding-profile.vo';
import { EmbeddingValidationException } from '../exceptions/vector-indexing.exceptions';
import { VectorIndexingErrorCode } from '../enums/vector-indexing-error-code.enum';

export interface CreateDocumentEmbeddingProps {
  id?: EmbeddingId | string;
  chunkId: ChunkId | string;
  documentId: string;
  documentVersionId: string;
  indexGenerationId: IndexGenerationId | string;
  profile: EmbeddingProfile;
  vector: VectorValues | number[];
  contentFingerprint: string;
  createdAt?: Date;
}

export interface ReconstituteDocumentEmbeddingProps {
  id: string;
  chunkId: string;
  documentId: string;
  documentVersionId: string;
  indexGenerationId: string;
  embeddingProfileId: string;
  dimensions: number;
  vector: number[];
  contentFingerprint: string;
  createdAt: Date;
}

/**
 * DocumentEmbedding Entity.
 * Represents an immutable dense vector embedding generated for a specific DocumentChunk
 * under a concrete, immutable EmbeddingProfile and bound to an IndexGeneration.
 */
export class DocumentEmbedding {
  public readonly id: EmbeddingId;
  public readonly chunkId: ChunkId;
  public readonly documentId: string;
  public readonly documentVersionId: string;
  public readonly indexGenerationId: IndexGenerationId;
  public readonly embeddingProfileId: string;
  public readonly dimensions: number;
  public readonly vector: VectorValues;
  public readonly contentFingerprint: string;
  public readonly createdAt: Date;

  private constructor(props: {
    id: EmbeddingId;
    chunkId: ChunkId;
    documentId: string;
    documentVersionId: string;
    indexGenerationId: IndexGenerationId;
    embeddingProfileId: string;
    dimensions: number;
    vector: VectorValues;
    contentFingerprint: string;
    createdAt: Date;
  }) {
    this.id = props.id;
    this.chunkId = props.chunkId;
    this.documentId = props.documentId;
    this.documentVersionId = props.documentVersionId;
    this.indexGenerationId = props.indexGenerationId;
    this.embeddingProfileId = props.embeddingProfileId;
    this.dimensions = props.dimensions;
    this.vector = props.vector;
    this.contentFingerprint = props.contentFingerprint;
    this.createdAt = props.createdAt;
  }

  /**
   * Factory method to create a new validated DocumentEmbedding.
   */
  public static create(props: CreateDocumentEmbeddingProps): DocumentEmbedding {
    const id = props.id instanceof EmbeddingId ? props.id : EmbeddingId.create(props.id);
    const chunkId =
      props.chunkId instanceof ChunkId ? props.chunkId : ChunkId.fromString(props.chunkId);
    const indexGenerationId =
      props.indexGenerationId instanceof IndexGenerationId
        ? props.indexGenerationId
        : IndexGenerationId.fromString(props.indexGenerationId);

    if (!props.documentId || props.documentId.trim() === '') {
      throw new EmbeddingValidationException(
        'documentId cannot be empty',
        VectorIndexingErrorCode.EMPTY_PAYLOAD,
      );
    }

    if (!props.documentVersionId || props.documentVersionId.trim() === '') {
      throw new EmbeddingValidationException(
        'documentVersionId cannot be empty',
        VectorIndexingErrorCode.EMPTY_PAYLOAD,
      );
    }

    if (!props.contentFingerprint || props.contentFingerprint.trim() === '') {
      throw new EmbeddingValidationException(
        'contentFingerprint cannot be empty',
        VectorIndexingErrorCode.EMPTY_PAYLOAD,
      );
    }

    const vectorValues =
      props.vector instanceof VectorValues
        ? props.vector
        : VectorValues.fromArray(props.vector, props.profile.dimensions);

    // Enforce dimension consistency with the embedding profile
    if (vectorValues.dimensions !== props.profile.dimensions) {
      throw new EmbeddingValidationException(
        `Vector dimensionality ${vectorValues.dimensions} does not match profile dimensions ${props.profile.dimensions}`,
        VectorIndexingErrorCode.DIMENSION_MISMATCH,
        {
          vectorDimensions: vectorValues.dimensions,
          profileDimensions: props.profile.dimensions,
          profileId: props.profile.profileId,
        },
      );
    }

    return new DocumentEmbedding({
      id,
      chunkId,
      documentId: props.documentId.trim(),
      documentVersionId: props.documentVersionId.trim(),
      indexGenerationId,
      embeddingProfileId: props.profile.profileId,
      dimensions: vectorValues.dimensions,
      vector: vectorValues,
      contentFingerprint: props.contentFingerprint.trim(),
      createdAt: props.createdAt ?? new Date(),
    });
  }

  /**
   * Reconstitutes an existing DocumentEmbedding entity from persistence.
   */
  public static reconstitute(props: ReconstituteDocumentEmbeddingProps): DocumentEmbedding {
    const id = EmbeddingId.fromString(props.id);
    const chunkId = ChunkId.fromString(props.chunkId);
    const indexGenerationId = IndexGenerationId.fromString(props.indexGenerationId);
    const vector = VectorValues.fromArray(props.vector, props.dimensions);

    return new DocumentEmbedding({
      id,
      chunkId,
      documentId: props.documentId,
      documentVersionId: props.documentVersionId,
      indexGenerationId,
      embeddingProfileId: props.embeddingProfileId,
      dimensions: props.dimensions,
      vector,
      contentFingerprint: props.contentFingerprint,
      createdAt: props.createdAt,
    });
  }
}
