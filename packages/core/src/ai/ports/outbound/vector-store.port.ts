import { DocumentEmbedding } from '../../domain/models/document-embedding.entity';

export interface VectorSearchOptions {
  tenantId: string;
  generationId: string;
  limit: number;
  minSimilarity?: number;
  documentIds?: string[];
  filterMetadata?: Record<string, unknown>;
}

export interface VectorSearchResult {
  embeddingId: string;
  chunkId: string;
  documentId: string;
  documentVersionId: string;
  generationId: string;
  similarity: number;
  distance: number;
}

export const VECTOR_STORE_PORT = Symbol('IVectorStorePort');

/**
 * Outbound Port defining the vector persistence boundary.
 * Pure domain contract completely isolated from pgvector, Prisma, or SQL drivers.
 */
export interface IVectorStorePort {
  /**
   * Persists a single validated document embedding.
   */
  save(embedding: DocumentEmbedding): Promise<void>;

  /**
   * Persists a bounded batch of document embeddings in an atomic transaction.
   */
  saveBatch(embeddings: DocumentEmbedding[]): Promise<void>;

  /**
   * Finds an embedding by chunk identifier and optional index generation.
   */
  findByChunkId(chunkId: string, generationId?: string): Promise<DocumentEmbedding | null>;

  /**
   * Finds all embeddings associated with a specific document version and optional generation.
   */
  findByDocumentVersionId(
    documentVersionId: string,
    generationId?: string,
  ): Promise<DocumentEmbedding[]>;

  /**
   * Performs an approximate or exact cosine distance vector similarity search.
   */
  similaritySearch(
    queryVector: number[],
    options: VectorSearchOptions,
  ): Promise<VectorSearchResult[]>;

  /**
   * Deletes all embeddings associated with a specific document (e.g., on GDPR erasure or document deletion).
   */
  deleteByDocumentId(documentId: string, tenantId?: string): Promise<number>;

  /**
   * Deletes all embeddings associated with a specific document version.
   */
  deleteByDocumentVersionId(versionId: string, tenantId?: string): Promise<number>;

  /**
   * Deletes all embeddings associated with a retired or cancelled index generation.
   */
  deleteByGenerationId(generationId: string): Promise<number>;

  /**
   * Returns the count of embeddings associated with a specific generation.
   */
  countByGenerationId(generationId: string): Promise<number>;
}
