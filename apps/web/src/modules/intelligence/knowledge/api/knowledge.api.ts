import {
  httpClient,
  type RequestOptions,
  type UploadOptions,
  type UploadProgress,
} from '../../../../shared/api/http-client';
import type {
  KnowledgeDocumentItem,
  PaginatedDocumentsResponse,
  KnowledgeCapabilitiesResponse,
  ListDocumentsQueryParams,
  IngestionJobItem,
  UpdateDocumentMetadataRequest,
  UploadDocumentResponse,
  DocumentPreviewMetadataResponse,
  DocumentVersionItem,
} from '../types/knowledge-contract.types';
import {
  parsePaginatedDocumentsResponse,
  parseKnowledgeDocumentItem,
  parseKnowledgeCapabilitiesResponse,
  parseIngestionJobItems,
  parseIngestionJobItem,
  parseUploadDocumentResponse,
  parseDocumentPreviewMetadataResponse,
  parseDocumentVersionsList,
} from '../schemas/knowledge-contract.schemas';

const BASE_PATH = '/api/v1/ai/knowledge/documents';

/**
 * Standardized API client for the Knowledge Center document management subsystem.
 * Communicates with backend NestJS `AiDocumentController`.
 */
export const knowledgeApi = {
  /**
   * Retrieves authoritative document management capabilities, size limits, and format constraints.
   */
  async getCapabilities(options?: RequestOptions): Promise<KnowledgeCapabilitiesResponse> {
    const raw = await httpClient.get<unknown>(`${BASE_PATH}/capabilities`, options);
    return parseKnowledgeCapabilitiesResponse(raw);
  },

  /**
   * Lists knowledge documents with server-side pagination, searching, and filtering.
   */
  async listDocuments(
    params?: ListDocumentsQueryParams,
    options?: RequestOptions,
  ): Promise<PaginatedDocumentsResponse> {
    const raw = await httpClient.get<unknown>(BASE_PATH, {
      ...options,
      params: params as Record<string, string | number | boolean | null | undefined>,
    });
    return parsePaginatedDocumentsResponse(raw);
  },

  /**
   * Retrieves full details for a single knowledge document and its version history.
   */
  async getDocument(
    documentId: string,
    options?: RequestOptions & { includeDeleted?: boolean },
  ): Promise<KnowledgeDocumentItem> {
    const raw = await httpClient.get<unknown>(`${BASE_PATH}/${encodeURIComponent(documentId)}`, {
      ...options,
      params: options?.includeDeleted ? { includeDeleted: true } : undefined,
    });
    return parseKnowledgeDocumentItem(raw);
  },

  /**
   * Retrieves all historical versions for a document.
   */
  async getDocumentVersions(
    documentId: string,
    options?: RequestOptions,
  ): Promise<DocumentVersionItem[]> {
    const raw = await httpClient.get<unknown>(
      `${BASE_PATH}/${encodeURIComponent(documentId)}/versions`,
      options,
    );
    return parseDocumentVersionsList(raw);
  },

  /**
   * Updates mutable metadata (title, description, visibilityScope) for a document.
   */
  async updateMetadata(
    documentId: string,
    body: UpdateDocumentMetadataRequest,
    options?: RequestOptions,
  ): Promise<KnowledgeDocumentItem> {
    const raw = await httpClient.patch<unknown>(
      `${BASE_PATH}/${encodeURIComponent(documentId)}`,
      body,
      options,
    );
    return parseKnowledgeDocumentItem(raw);
  },

  /**
   * Soft-deletes a document and purges its indexed vectors.
   */
  async deleteDocument(documentId: string, options?: RequestOptions): Promise<void> {
    await httpClient.delete<void>(`${BASE_PATH}/${encodeURIComponent(documentId)}`, options);
  },

  /**
   * Restores a previously soft-deleted document back to ACTIVE status and enqueues re-indexing.
   */
  async restoreDocument(
    documentId: string,
    options?: RequestOptions,
  ): Promise<KnowledgeDocumentItem> {
    const raw = await httpClient.post<unknown>(
      `${BASE_PATH}/${encodeURIComponent(documentId)}/restore`,
      undefined,
      options,
    );
    return parseKnowledgeDocumentItem(raw);
  },

  /**
   * Reprocesses and reindexes an active document (purges old vectors and starts new ingestion job).
   */
  async reprocessDocument(documentId: string, options?: RequestOptions): Promise<IngestionJobItem> {
    const raw = await httpClient.post<unknown>(
      `${BASE_PATH}/${encodeURIComponent(documentId)}/reprocess`,
      undefined,
      options,
    );
    return parseIngestionJobItem(raw);
  },

  /**
   * Retrieves historical ingestion jobs for all versions of a document.
   */
  async getIngestionHistory(
    documentId: string,
    options?: RequestOptions,
  ): Promise<IngestionJobItem[]> {
    const raw = await httpClient.get<unknown>(
      `${BASE_PATH}/${encodeURIComponent(documentId)}/ingestion`,
      options,
    );
    return parseIngestionJobItems(raw);
  },

  /**
   * Retries failed ingestion for the current version of a document.
   */
  async retryIngestion(documentId: string, options?: RequestOptions): Promise<IngestionJobItem> {
    const raw = await httpClient.post<unknown>(
      `${BASE_PATH}/${encodeURIComponent(documentId)}/ingestion/retry`,
      undefined,
      options,
    );
    return parseIngestionJobItem(raw);
  },

  /**
   * Cancels active in-flight ingestion for the current version of a document.
   */
  async cancelIngestion(
    documentId: string,
    body?: { reason?: string },
    options?: RequestOptions,
  ): Promise<IngestionJobItem> {
    const raw = await httpClient.post<unknown>(
      `${BASE_PATH}/${encodeURIComponent(documentId)}/ingestion/cancel`,
      body,
      options,
    );
    return parseIngestionJobItem(raw);
  },

  /**
   * Uploads a new document via multipart/form-data with progress and cancellation support.
   */
  async uploadDocument(
    formData: FormData,
    options?: UploadOptions,
  ): Promise<UploadDocumentResponse> {
    const raw = await httpClient.upload<unknown>(BASE_PATH, formData, options);
    return parseUploadDocumentResponse(raw);
  },

  /**
   * Uploads a subsequent version for an existing document.
   */
  async uploadVersion(
    documentId: string,
    formData: FormData,
    options?: UploadOptions,
  ): Promise<UploadDocumentResponse> {
    const raw = await httpClient.upload<unknown>(
      `${BASE_PATH}/${encodeURIComponent(documentId)}/versions`,
      formData,
      options,
    );
    return parseUploadDocumentResponse(raw);
  },
  /**
   * Downloads a document file payload (or a specific version) as a binary Blob.
   */
  async downloadDocument(
    documentId: string,
    versionId?: string,
    options?: RequestOptions,
  ): Promise<Blob> {
    const path = versionId
      ? `${BASE_PATH}/${encodeURIComponent(documentId)}/versions/${encodeURIComponent(versionId)}/content`
      : `${BASE_PATH}/${encodeURIComponent(documentId)}/content`;
    return httpClient.getBlob(path, options);
  },

  /**
   * Retrieves preview metadata and access authorization for a document version.
   */
  async getPreviewMetadata(
    documentId: string,
    params?: { versionId?: string; versionNumber?: number },
    options?: RequestOptions,
  ): Promise<DocumentPreviewMetadataResponse> {
    const queryParams: Record<string, string | number> = {};
    if (params?.versionId) queryParams.versionId = params.versionId;
    if (params?.versionNumber) queryParams.versionNumber = params.versionNumber;

    const raw = await httpClient.get<unknown>(
      `${BASE_PATH}/${encodeURIComponent(documentId)}/preview-metadata`,
      {
        ...options,
        params: queryParams,
      },
    );
    return parseDocumentPreviewMetadataResponse(raw);
  },

  /**
   * Fetches document binary payload as a Blob for in-browser preview or textual inspection.
   */
  async getDocumentContentBlob(
    documentId: string,
    params?: { versionId?: string; versionNumber?: number },
    options?: RequestOptions,
  ): Promise<Blob> {
    const queryParams: Record<string, string | number> = {};
    if (params?.versionId) queryParams.versionId = params.versionId;
    if (params?.versionNumber) queryParams.versionNumber = params.versionNumber;

    const path = params?.versionId
      ? `${BASE_PATH}/${encodeURIComponent(documentId)}/versions/${encodeURIComponent(params.versionId)}/content`
      : `${BASE_PATH}/${encodeURIComponent(documentId)}/content`;

    return httpClient.getBlob(path, {
      ...options,
      params: queryParams,
    });
  },
};

/**
 * Triggers a browser-level file download from a KnowledgeDocumentItem.
 */
export type { UploadOptions, UploadProgress };

/**
 * Triggers a browser-level file download from a KnowledgeDocumentItem.
 */
export async function triggerDocumentDownload(document: KnowledgeDocumentItem): Promise<void> {
  const blob = await knowledgeApi.downloadDocument(document.id, document.currentVersionId);
  const url = window.URL.createObjectURL(blob);
  const anchor = window.document.createElement('a');
  anchor.href = url;
  anchor.download =
    document.originalFileName || `${document.title}.${document.fileExtension || 'pdf'}`;
  window.document.body.appendChild(anchor);
  anchor.click();
  window.document.body.removeChild(anchor);
  window.URL.revokeObjectURL(url);
}
