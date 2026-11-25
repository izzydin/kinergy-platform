/**
 * Typed contracts for Kynergy Intelligence Knowledge Center document management.
 * Conforms strictly to backend DTOs in `ai-document.dto.ts`.
 */

export type VisibilityScope = 'ALL_STAFF' | 'CLINICAL_STAFF' | 'MANAGEMENT';

export type IngestionStatus =
  'UPLOADED' | 'VALIDATING' | 'PROCESSING' | 'INDEXING' | 'READY' | 'FAILED' | 'CANCELLED';

export interface DocumentVersionItem {
  readonly id: string;
  readonly versionNumber: number;
  readonly originalFileName: string;
  readonly mimeType: string;
  readonly fileExtension?: string;
  readonly fileSize: number;
  readonly checksum: string;
  readonly language?: string;
  readonly uploadedBy: string;
  readonly storageReference?: string;
  readonly ingestionStatus?: IngestionStatus;
  readonly createdAt: string;
}

export interface KnowledgeDocumentItem {
  readonly id: string;
  readonly title: string;
  readonly description?: string | null;
  readonly visibilityScope: VisibilityScope;
  readonly currentVersionId: string;
  readonly uploadedBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly originalFileName?: string;
  readonly mimeType?: string;
  readonly fileExtension?: string;
  readonly fileSize?: number;
  readonly checksum?: string;
  readonly versionNumber?: number;
  readonly versionCount?: number;
  readonly storageReference?: string;
  readonly ingestionStatus?: IngestionStatus;
  readonly status?: 'ACTIVE' | 'DELETED';
  readonly isDeleted?: boolean;
  readonly deletedAt?: string | null;
  readonly versions: readonly DocumentVersionItem[];
}

export interface PaginatedDocumentsResponse {
  readonly items: readonly KnowledgeDocumentItem[];
  readonly page: number;
  readonly limit: number;
  readonly total: number;
  readonly totalPages: number;
  readonly hasNextPage: boolean;
  readonly hasPreviousPage: boolean;
}

export interface KnowledgeCapabilitiesResponse {
  readonly maxFileSizeBytes: number;
  readonly maxFileSizeMb: number;
  readonly allowedMimeTypes: readonly string[];
  readonly allowedExtensions: readonly string[];
  readonly supportedVisibilityScopes: readonly VisibilityScope[];
}

export interface ListDocumentsQueryParams {
  readonly page?: number;
  readonly limit?: number;
  readonly search?: string;
  readonly visibilityScope?: VisibilityScope;
  readonly mimeType?: string;
  readonly uploadedBy?: string;
  readonly createdFrom?: string;
  readonly createdTo?: string;
  readonly orderBy?: 'createdAt' | 'updatedAt' | 'title';
  readonly orderDirection?: 'asc' | 'desc';
}

export interface IngestionJobItem {
  readonly id: string;
  readonly documentId: string;
  readonly documentVersionId: string;
  readonly status: IngestionStatus;
  readonly attemptCount: number;
  readonly maxAttempts: number;
  readonly lastErrorCode?: string | null;
  readonly lastErrorMessage?: string | null;
  readonly createdAt: string;
  readonly completedAt?: string | null;
}

export interface UpdateDocumentMetadataRequest {
  readonly title?: string;
  readonly description?: string;
  readonly visibilityScope?: VisibilityScope;
}

export interface UploadDocumentResponse {
  readonly documentId: string;
  readonly versionId: string;
  readonly versionNumber: number;
  readonly title: string;
  readonly originalFileName: string;
  readonly mimeType: string;
  readonly fileSize: number;
  readonly checksum: string;
  readonly visibilityScope: VisibilityScope;
  readonly ingestionJobId: string;
  readonly ingestionStatus: IngestionStatus;
  readonly createdAt: string;
}

export interface DocumentPreviewMetadataResponse {
  readonly documentId: string;
  readonly versionId: string;
  readonly versionNumber: number;
  readonly title: string;
  readonly mimeType: string;
  readonly fileSize: number;
  readonly originalFileName: string;
  readonly checksum: string;
  readonly canPreview: boolean;
  readonly visibilityScope: VisibilityScope;
  readonly isAuthorized: boolean;
  readonly isDeleted: boolean;
}
