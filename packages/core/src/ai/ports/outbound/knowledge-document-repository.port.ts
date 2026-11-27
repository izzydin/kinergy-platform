import { KnowledgeDocument } from '../../domain/models/knowledge-document.aggregate';
import { DocumentId } from '../../domain/value-objects/document-id.vo';
import { VisibilityScope } from '../../domain/enums/visibility-scope.enum';

export const KNOWLEDGE_DOCUMENT_REPOSITORY_PORT = Symbol('KNOWLEDGE_DOCUMENT_REPOSITORY_PORT');

export interface FindDocumentsFilter {
  includeDeleted?: boolean;
  visibilityScope?: VisibilityScope;
  visibilityScopes?: VisibilityScope[];
  search?: string;
  mimeType?: string;
  uploadedBy?: string;
  createdFrom?: Date;
  createdTo?: Date;
  limit?: number;
  offset?: number;
  orderBy?: 'createdAt' | 'updatedAt' | 'title';
  orderDirection?: 'asc' | 'desc';
}

/**
 * Port contract for KnowledgeDocument persistence.
 * Pure TypeScript interface decoupled from database technologies.
 */
export interface IKnowledgeDocumentRepositoryPort {
  /**
   * Persists a KnowledgeDocument aggregate root and its contained versions atomically.
   */
  save(document: KnowledgeDocument): Promise<KnowledgeDocument>;

  /**
   * Retrieves a document by ID within a tenant boundary.
   */
  findById(tenantId: string, id: DocumentId | string): Promise<KnowledgeDocument | null>;

  /**
   * Finds an active document by content checksum within a tenant boundary (for deduplication).
   */
  findByChecksum(tenantId: string, checksum: string): Promise<KnowledgeDocument | null>;

  /**
   * Lists documents for a tenant with optional filtering.
   */
  findAll(tenantId: string, filter?: FindDocumentsFilter): Promise<KnowledgeDocument[]>;

  /**
   * Counts documents matching criteria for a tenant (for pagination).
   */
  count(tenantId: string, filter?: FindDocumentsFilter): Promise<number>;

  /**
   * Soft-deletes a document within a tenant boundary.
   */
  softDelete(tenantId: string, id: DocumentId | string, deletedBy: string): Promise<void>;
}
