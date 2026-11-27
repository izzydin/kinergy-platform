import { ChunkId } from '../value-objects/chunk-id.vo';
import { ChunkProvenance } from '../value-objects/chunk-provenance.vo';
import { DocumentValidationException } from '../exceptions/knowledge-document.exceptions';

export interface CreateDocumentChunkProps {
  id?: ChunkId | string;
  documentId: string;
  documentVersionId: string;
  sequence: number;
  content: string;
  tokenCount: number;
  language?: string;
  provenance: ChunkProvenance;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
}

/**
 * Domain Entity representing an individual text chunk derived from an immutable DocumentVersion.
 * Serves as the fundamental unit of context assembly, vector indexing (Milestone AI-05),
 * and precision citation retrieval with comprehensive provenance tracking.
 */
export class DocumentChunk {
  public readonly id: ChunkId;
  public readonly documentId: string;
  public readonly documentVersionId: string;
  public readonly sequence: number;
  public readonly content: string;
  public readonly tokenCount: number;
  public readonly language: string;
  public readonly provenance: ChunkProvenance;
  public readonly metadata: Readonly<Record<string, unknown>>;
  public readonly createdAt: Date;

  private constructor(props: {
    id: ChunkId;
    documentId: string;
    documentVersionId: string;
    sequence: number;
    content: string;
    tokenCount: number;
    language: string;
    provenance: ChunkProvenance;
    metadata: Record<string, unknown>;
    createdAt: Date;
  }) {
    this.id = props.id;
    this.documentId = props.documentId;
    this.documentVersionId = props.documentVersionId;
    this.sequence = props.sequence;
    this.content = props.content;
    this.tokenCount = props.tokenCount;
    this.language = props.language;
    this.provenance = props.provenance;
    this.metadata = Object.freeze({ ...props.metadata });
    this.createdAt = new Date(props.createdAt.getTime());
    Object.freeze(this);
  }

  public static create(props: CreateDocumentChunkProps): DocumentChunk {
    if (!props.documentId || props.documentId.trim() === '') {
      throw new DocumentValidationException('DocumentChunk requires a non-empty documentId.');
    }
    if (!props.documentVersionId || props.documentVersionId.trim() === '') {
      throw new DocumentValidationException(
        'DocumentChunk requires a non-empty documentVersionId.',
      );
    }
    if (!props.content || props.content.trim().length === 0) {
      throw new DocumentValidationException('DocumentChunk content cannot be empty.');
    }
    if (!Number.isInteger(props.sequence) || props.sequence < 0) {
      throw new DocumentValidationException(
        `Chunk sequence must be a non-negative integer, received: ${props.sequence}`,
      );
    }
    if (!Number.isInteger(props.tokenCount) || props.tokenCount < 1) {
      throw new DocumentValidationException(
        `Chunk token count must be a positive integer >= 1, received: ${props.tokenCount}`,
      );
    }
    if (!props.provenance || !(props.provenance instanceof ChunkProvenance)) {
      throw new DocumentValidationException(
        'DocumentChunk requires a valid ChunkProvenance value object.',
      );
    }

    // Invariant: Provenance must bind strictly to the same document and version
    if (props.provenance.documentId !== props.documentId.trim()) {
      throw new DocumentValidationException(
        `Provenance documentId '${props.provenance.documentId}' does not match chunk documentId '${props.documentId}'.`,
      );
    }
    if (props.provenance.documentVersionId !== props.documentVersionId.trim()) {
      throw new DocumentValidationException(
        `Provenance documentVersionId '${props.provenance.documentVersionId}' does not match chunk documentVersionId '${props.documentVersionId}'.`,
      );
    }
    if (props.provenance.chunkIndex !== props.sequence) {
      throw new DocumentValidationException(
        `Provenance chunkIndex (${props.provenance.chunkIndex}) must equal chunk sequence (${props.sequence}).`,
      );
    }

    const id =
      props.id instanceof ChunkId
        ? props.id
        : ChunkId.create(typeof props.id === 'string' ? props.id : undefined);

    const language = (props.language || props.provenance.language || 'es').toLowerCase().trim();

    // Invariant: Sanitize metadata to strip any reserved authorization attributes or tenant override attempts
    const sanitizedMetadata: Record<string, unknown> = {};
    if (props.metadata && typeof props.metadata === 'object') {
      const FORBIDDEN_METADATA_KEYS = new Set([
        'tenantid',
        'tenant_id',
        'visibilityscope',
        'visibility_scope',
        'uploadedby',
        'uploaded_by',
        'deletedat',
        'deleted_at',
        'roles',
        'permissions',
      ]);
      for (const [key, val] of Object.entries(props.metadata)) {
        if (!FORBIDDEN_METADATA_KEYS.has(key.toLowerCase().trim())) {
          sanitizedMetadata[key] = val;
        }
      }
    }

    return new DocumentChunk({
      id,
      documentId: props.documentId.trim(),
      documentVersionId: props.documentVersionId.trim(),
      sequence: props.sequence,
      content: props.content.trim(),
      tokenCount: props.tokenCount,
      language,
      provenance: props.provenance,
      metadata: sanitizedMetadata,
      createdAt: props.createdAt ? new Date(props.createdAt.getTime()) : new Date(),
    });
  }

  public get charCount(): number {
    return this.content.length;
  }

  public get checksum(): string {
    return this.provenance.checksum;
  }
}
