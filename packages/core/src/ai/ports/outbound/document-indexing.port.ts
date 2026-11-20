export const DOCUMENT_INDEXING_PORT = Symbol('DOCUMENT_INDEXING_PORT');

/**
 * Metadata and payload reference required for document chunking and vector indexing.
 */
export interface DocumentIndexingRequest {
  readonly tenantId: string;
  readonly documentId: string;
  readonly versionId: string;
  readonly versionNumber: number;
  readonly mimeType: string;
  readonly storageKey: string;
}

/**
 * Outcome of downstream indexing execution.
 */
export interface DocumentIndexingResult {
  readonly indexed: boolean;
  readonly chunkCount?: number;
  readonly embeddingModel?: string;
  readonly notes?: string;
}

/**
 * Outbound port for document vector indexing and embedding generation.
 * Follows Hexagonal Architecture: core domain depends on this contract,
 * while concrete vector store adapters (e.g. pgvector / Qdrant) implement it.
 */
export interface IDocumentIndexingPort {
  /**
   * Executes or initiates indexing for the specified document version.
   * If downstream vector storage is awaiting subsequent milestone integration (AI-04),
   * this port completes the lifecycle handshake and returns execution notes.
   */
  indexDocument(request: DocumentIndexingRequest): Promise<DocumentIndexingResult>;
}
