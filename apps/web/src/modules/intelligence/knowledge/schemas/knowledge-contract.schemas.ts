import { z } from 'zod';
import type {
  VisibilityScope,
  IngestionStatus,
  IngestionStageId,
  IngestionStageStatus,
  IngestionFailureCategory,
  IngestionFailureInfo,
  IngestionStageMetrics,
  IngestionStageInfo,
  IngestionRetrievalStatus,
  DocumentVersionItem,
  KnowledgeDocumentItem,
  PaginatedDocumentsResponse,
  KnowledgeCapabilitiesResponse,
  IngestionJobItem,
  UploadDocumentResponse,
  DocumentPreviewMetadataResponse,
} from '../types/knowledge-contract.types';

export const VisibilityScopeSchema: z.ZodType<VisibilityScope> = z.enum([
  'ALL_STAFF',
  'CLINICAL_STAFF',
  'MANAGEMENT',
]);

export const IngestionStatusSchema: z.ZodType<IngestionStatus> = z.enum([
  'UPLOADED',
  'VALIDATING',
  'PROCESSING',
  'INDEXING',
  'READY',
  'FAILED',
  'CANCELLED',
]);

export const DocumentVersionItemSchema: z.ZodType<DocumentVersionItem> = z.object({
  id: z.string().min(1),
  versionNumber: z.number().int().min(1),
  originalFileName: z.string().min(1),
  mimeType: z.string().min(1),
  fileExtension: z.string().optional(),
  fileSize: z.number().int().min(0),
  checksum: z.string().min(1),
  language: z.string().optional(),
  uploadedBy: z.string().min(1),
  storageReference: z.string().optional(),
  ingestionStatus: IngestionStatusSchema.optional(),
  createdAt: z.string(),
});

export const KnowledgeDocumentItemSchema: z.ZodType<KnowledgeDocumentItem> = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  visibilityScope: VisibilityScopeSchema,
  currentVersionId: z.string(),
  uploadedBy: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
  originalFileName: z.string().optional(),
  mimeType: z.string().optional(),
  fileExtension: z.string().optional(),
  fileSize: z.number().optional(),
  checksum: z.string().optional(),
  versionNumber: z.number().optional(),
  versionCount: z.number().optional(),
  storageReference: z.string().optional(),
  ingestionStatus: IngestionStatusSchema.optional(),
  status: z.enum(['ACTIVE', 'DELETED']).optional(),
  isDeleted: z.boolean().optional(),
  deletedAt: z.string().nullable().optional(),
  versions: z.array(DocumentVersionItemSchema),
});

export const PaginatedDocumentsResponseSchema: z.ZodType<PaginatedDocumentsResponse> = z.object({
  items: z.array(KnowledgeDocumentItemSchema),
  page: z.number().int().min(1),
  limit: z.number().int().min(1),
  total: z.number().int().min(0),
  totalPages: z.number().int().min(0),
  hasNextPage: z.boolean(),
  hasPreviousPage: z.boolean(),
});

export const KnowledgeCapabilitiesResponseSchema: z.ZodType<KnowledgeCapabilitiesResponse> =
  z.object({
    maxFileSizeBytes: z.number().int().min(1),
    maxFileSizeMb: z.number().min(1),
    allowedMimeTypes: z.array(z.string()),
    allowedExtensions: z.array(z.string()),
    supportedVisibilityScopes: z.array(VisibilityScopeSchema),
  });

export const IngestionStageIdSchema: z.ZodType<IngestionStageId> = z.enum([
  'VALIDATING',
  'PROCESSING',
  'INDEXING',
]);

export const IngestionStageStatusSchema: z.ZodType<IngestionStageStatus> = z.enum([
  'PENDING',
  'IN_PROGRESS',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'SKIPPED',
]);

export const IngestionFailureCategorySchema: z.ZodType<IngestionFailureCategory> = z.enum([
  'VALIDATION',
  'PARSING',
  'CHUNKING',
  'INDEXING',
  'STORAGE',
  'INFRASTRUCTURE',
  'TIMEOUT',
  'CANCELLATION',
  'UNKNOWN',
]);

export const IngestionFailureInfoSchema: z.ZodType<IngestionFailureInfo> = z.object({
  code: z.string(),
  category: IngestionFailureCategorySchema,
  message: z.string(),
  failedStage: IngestionStageIdSchema.optional(),
  isRetryable: z.boolean().optional(),
  failedAt: z.string().optional(),
  attemptNumber: z.number().int().optional(),
  occurredAt: z.string().optional(),
  isTransient: z.boolean().optional(),
  canRetry: z.boolean().optional(),
});

export const IngestionStageMetricsSchema: z.ZodType<IngestionStageMetrics> = z.object({
  totalChunks: z.number().int().optional(),
  embeddedChunks: z.number().int().optional(),
  indexedChunks: z.number().int().optional(),
  extractedTokens: z.number().int().optional(),
  indexGenerationId: z.string().nullable().optional(),
  customMetrics: z.record(z.number()).optional(),
});

export const IngestionStageInfoSchema: z.ZodType<IngestionStageInfo> = z.object({
  stage: IngestionStageIdSchema,
  label: z.string().optional(),
  status: IngestionStageStatusSchema,
  order: z.number().int().optional(),
  startedAt: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  durationMs: z.number().nullable().optional(),
  metrics: IngestionStageMetricsSchema.nullable().optional(),
  failureInfo: IngestionFailureInfoSchema.nullable().optional(),
  error: z.string().optional(),
});

export const IngestionRetrievalStatusSchema: z.ZodType<IngestionRetrievalStatus> = z.object({
  documentId: z.string().optional(),
  isReadyForRetrieval: z.boolean(),
  overallReady: z.boolean().optional(),
  hasActiveIndexGeneration: z.boolean().optional(),
  isDocumentActive: z.boolean().optional(),
  chunksPersisted: z.boolean().optional(),
  embeddingsCommitted: z.boolean().optional(),
  activeGenerationId: z.string().nullable().optional(),
  targetVersionId: z.string().nullable().optional(),
  targetVersionNumber: z.number().nullable().optional(),
  currentVersionId: z.string().nullable().optional(),
  currentVersionNumber: z.number().nullable().optional(),
  indexedVersionId: z.string().nullable().optional(),
  indexedVersionNumber: z.number().nullable().optional(),
  hasVersionDiscrepancy: z.boolean().optional(),
  discrepancyReason: z.string().nullable().optional(),
  lastSuccessfulIndexingAt: z.string().nullable().optional(),
  totalChunks: z.number().optional(),
  indexedChunks: z.number().optional(),
  embeddingsCount: z.number().optional(),
  reasons: z.array(z.string()).optional(),
  reason: z.string().optional(),
  evaluatedAt: z.string().optional(),
});

export const IngestionJobItemSchema: z.ZodType<IngestionJobItem> = z.object({
  id: z.string().min(1),
  documentId: z.string().min(1),
  documentVersionId: z.string().min(1),
  versionNumber: z.number().int().optional(),
  status: IngestionStatusSchema,
  currentStage: z.string().optional(),
  attemptCount: z.number().int().min(0),
  maxAttempts: z.number().int().min(1),
  startedAt: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  nextRetryAt: z.string().nullable().optional(),
  cancelledAt: z.string().nullable().optional(),
  cancellationReason: z.string().nullable().optional(),
  durationMs: z.number().nullable().optional(),
  isTerminal: z.boolean().optional(),
  canRetry: z.boolean().optional(),
  lastErrorCode: z.string().nullable().optional(),
  lastErrorMessage: z.string().nullable().optional(),
  failureInfo: IngestionFailureInfoSchema.nullable().optional(),
  stages: z.array(IngestionStageInfoSchema).optional(),
  retrievalStatus: IngestionRetrievalStatusSchema.nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
});

export const UploadDocumentResponseSchema: z.ZodType<UploadDocumentResponse> = z.object({
  documentId: z.string().min(1),
  versionId: z.string().min(1),
  versionNumber: z.number().int().min(1),
  title: z.string().min(1),
  originalFileName: z.string().min(1),
  mimeType: z.string().min(1),
  fileSize: z.number().int().min(0),
  checksum: z.string().min(1),
  visibilityScope: VisibilityScopeSchema,
  ingestionJobId: z.string().min(1),
  ingestionStatus: IngestionStatusSchema,
  createdAt: z.string(),
});

export const DocumentPreviewMetadataResponseSchema: z.ZodType<DocumentPreviewMetadataResponse> =
  z.object({
    documentId: z.string().min(1),
    versionId: z.string().min(1),
    versionNumber: z.number().int().min(1),
    title: z.string().min(1),
    mimeType: z.string().min(1),
    fileSize: z.number().int().min(0),
    originalFileName: z.string().min(1),
    checksum: z.string().min(1),
    canPreview: z.boolean(),
    visibilityScope: VisibilityScopeSchema,
    isAuthorized: z.boolean(),
    isDeleted: z.boolean(),
    status: z.enum(['ACTIVE', 'ARCHIVED', 'DELETED']).optional(),
    isArchived: z.boolean().optional(),
  });

export function parsePaginatedDocumentsResponse(data: unknown): PaginatedDocumentsResponse {
  return PaginatedDocumentsResponseSchema.parse(data);
}

export function parseKnowledgeDocumentItem(data: unknown): KnowledgeDocumentItem {
  return KnowledgeDocumentItemSchema.parse(data);
}

export function parseKnowledgeCapabilitiesResponse(data: unknown): KnowledgeCapabilitiesResponse {
  return KnowledgeCapabilitiesResponseSchema.parse(data);
}

export function parseIngestionJobItems(data: unknown): IngestionJobItem[] {
  return z.array(IngestionJobItemSchema).parse(data);
}

export function parseIngestionJobItem(data: unknown): IngestionJobItem {
  return IngestionJobItemSchema.parse(data);
}

export function parseUploadDocumentResponse(data: unknown): UploadDocumentResponse {
  return UploadDocumentResponseSchema.parse(data);
}

export function parseDocumentPreviewMetadataResponse(
  data: unknown,
): DocumentPreviewMetadataResponse {
  return DocumentPreviewMetadataResponseSchema.parse(data);
}

export function parseDocumentVersionsList(data: unknown): DocumentVersionItem[] {
  return z.array(DocumentVersionItemSchema).parse(data);
}

export function parseIngestionRetrievalStatus(data: unknown): IngestionRetrievalStatus {
  return IngestionRetrievalStatusSchema.parse(data);
}
