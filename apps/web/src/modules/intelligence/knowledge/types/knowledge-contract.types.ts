/**
 * Typed contracts for Kynergy Intelligence Knowledge Center document management.
 * Conforms strictly to backend DTOs in `ai-document.dto.ts`.
 */

export type VisibilityScope = 'ALL_STAFF' | 'CLINICAL_STAFF' | 'MANAGEMENT';

export type IngestionStatus =
  'UPLOADED' | 'VALIDATING' | 'PROCESSING' | 'INDEXING' | 'READY' | 'FAILED' | 'CANCELLED';

export type IngestionStageId = 'VALIDATING' | 'PROCESSING' | 'INDEXING';

export type IngestionStageStatus =
  'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'SKIPPED';

export type IngestionFailureCategory =
  | 'VALIDATION'
  | 'PARSING'
  | 'CHUNKING'
  | 'INDEXING'
  | 'STORAGE'
  | 'INFRASTRUCTURE'
  | 'TIMEOUT'
  | 'CANCELLATION'
  | 'UNKNOWN';

export interface IngestionFailureInfo {
  readonly code: string;
  readonly category: IngestionFailureCategory;
  readonly message: string;
  readonly failedStage?: IngestionStageId;
  readonly isRetryable?: boolean;
  readonly failedAt?: string;
  readonly attemptNumber?: number;
  readonly occurredAt?: string;
  readonly isTransient?: boolean;
  readonly canRetry?: boolean;
}

export interface IngestionStageMetrics {
  readonly totalChunks?: number;
  readonly embeddedChunks?: number;
  readonly indexedChunks?: number;
  readonly extractedTokens?: number;
  readonly indexGenerationId?: string | null;
  readonly customMetrics?: Record<string, number>;
}

export interface IngestionStageInfo {
  readonly stage: IngestionStageId;
  readonly label?: string;
  readonly status: IngestionStageStatus;
  readonly order?: number;
  readonly startedAt?: string | null;
  readonly completedAt?: string | null;
  readonly durationMs?: number | null;
  readonly metrics?: IngestionStageMetrics | null;
  readonly failureInfo?: IngestionFailureInfo | null;
  readonly error?: string;
}

export interface IngestionRetrievalStatus {
  readonly documentId?: string;
  readonly isReadyForRetrieval: boolean;
  readonly overallReady?: boolean;
  readonly hasActiveIndexGeneration?: boolean;
  readonly isDocumentActive?: boolean;
  readonly chunksPersisted?: boolean;
  readonly embeddingsCommitted?: boolean;
  readonly activeGenerationId?: string | null;
  readonly targetVersionId?: string | null;
  readonly targetVersionNumber?: number | null;
  readonly currentVersionId?: string | null;
  readonly currentVersionNumber?: number | null;
  readonly indexedVersionId?: string | null;
  readonly indexedVersionNumber?: number | null;
  readonly hasVersionDiscrepancy?: boolean;
  readonly discrepancyReason?: string | null;
  readonly lastSuccessfulIndexingAt?: string | null;
  readonly totalChunks?: number;
  readonly indexedChunks?: number;
  readonly embeddingsCount?: number;
  readonly reasons?: readonly string[];
  readonly reason?: string;
  readonly evaluatedAt?: string;
}

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
  readonly versionNumber?: number;
  readonly status: IngestionStatus;
  readonly currentStage?: string;
  readonly attemptCount: number;
  readonly maxAttempts: number;
  readonly startedAt?: string | null;
  readonly completedAt?: string | null;
  readonly nextRetryAt?: string | null;
  readonly cancelledAt?: string | null;
  readonly cancellationReason?: string | null;
  readonly durationMs?: number | null;
  readonly isTerminal?: boolean;
  readonly canRetry?: boolean;
  readonly lastErrorCode?: string | null;
  readonly lastErrorMessage?: string | null;
  readonly failureInfo?: IngestionFailureInfo | null;
  readonly stages?: readonly IngestionStageInfo[];
  readonly retrievalStatus?: IngestionRetrievalStatus | null;
  readonly createdAt: string;
  readonly updatedAt?: string;
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
