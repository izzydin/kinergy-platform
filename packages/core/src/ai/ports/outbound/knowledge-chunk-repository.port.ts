import { DocumentChunk } from '../../domain/models/document-chunk.entity';

export const KNOWLEDGE_CHUNK_REPOSITORY = Symbol('KNOWLEDGE_CHUNK_REPOSITORY');

/**
 * Outbound port contract for persisting and retrieving structured document chunks.
 * Enforces tenant isolation, version association, and atomic idempotency.
 */
export interface IKnowledgeChunkRepositoryPort {
  /**
   * Atomically saves chunks for a specific document version.
   * If chunks already exist for this document version, replaces them completely
   * within an ACID transaction (idempotent reprocessing).
   */
  saveChunks(
    tenantId: string,
    documentId: string,
    versionId: string,
    chunks: readonly DocumentChunk[],
  ): Promise<void>;

  /**
   * Retrieves all chunks for a document version ordered by sequence ascending.
   */
  findByVersionId(tenantId: string, versionId: string): Promise<DocumentChunk[]>;

  /**
   * Deletes all chunks associated with a document version.
   */
  deleteByVersionId(tenantId: string, versionId: string): Promise<number>;

  /**
   * Counts the number of chunks stored for a document version.
   */
  countByVersionId(tenantId: string, versionId: string): Promise<number>;
}
