import { z } from 'zod';
import type {
  VisibilityScope,
  IngestionStatus,
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

export const IngestionJobItemSchema: z.ZodType<IngestionJobItem> = z.object({
  id: z.string().min(1),
  documentId: z.string().min(1),
  documentVersionId: z.string().min(1),
  status: IngestionStatusSchema,
  attemptCount: z.number().int().min(1),
  maxAttempts: z.number().int().min(1),
  lastErrorCode: z.string().nullable().optional(),
  lastErrorMessage: z.string().nullable().optional(),
  createdAt: z.string(),
  completedAt: z.string().nullable().optional(),
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
