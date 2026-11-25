import { useQuery, keepPreviousData, type UseQueryOptions } from '@tanstack/react-query';
import { useOptionalAuth } from '../../../../app/providers/auth-provider';
import { knowledgeApi } from '../api/knowledge.api';
import { knowledgeQueryKeys } from '../api/knowledge-query-keys';
import type {
  KnowledgeCapabilitiesResponse,
  PaginatedDocumentsResponse,
  KnowledgeDocumentItem,
  ListDocumentsQueryParams,
  IngestionJobItem,
  DocumentPreviewMetadataResponse,
  DocumentVersionItem,
} from '../types/knowledge-contract.types';

export function useKnowledgeCapabilities(
  options?: Omit<
    UseQueryOptions<
      KnowledgeCapabilitiesResponse,
      Error,
      KnowledgeCapabilitiesResponse,
      readonly unknown[]
    >,
    'queryKey' | 'queryFn'
  >,
) {
  const auth = useOptionalAuth();
  const scope = { tenantId: auth?.currentUser?.tenantId ?? undefined };

  return useQuery({
    queryKey: knowledgeQueryKeys.capabilities(scope),
    queryFn: ({ signal }) => knowledgeApi.getCapabilities({ signal }),
    staleTime: 10 * 60 * 1000, // 10 minutes cache
    ...options,
  });
}

export function useKnowledgeDocuments(
  params?: ListDocumentsQueryParams,
  options?: Omit<
    UseQueryOptions<
      PaginatedDocumentsResponse,
      Error,
      PaginatedDocumentsResponse,
      readonly unknown[]
    >,
    'queryKey' | 'queryFn'
  >,
) {
  const auth = useOptionalAuth();
  const scope = { tenantId: auth?.currentUser?.tenantId ?? undefined };

  return useQuery({
    queryKey: knowledgeQueryKeys.list(params, scope),
    queryFn: ({ signal }) => knowledgeApi.listDocuments(params, { signal }),
    staleTime: 30 * 1000, // 30 seconds cache
    placeholderData: keepPreviousData,
    ...options,
  });
}

export function useKnowledgeDocument(
  documentId: string | undefined,
  options?: Omit<
    UseQueryOptions<KnowledgeDocumentItem, Error, KnowledgeDocumentItem, readonly unknown[]>,
    'queryKey' | 'queryFn'
  > & { includeDeleted?: boolean },
) {
  const auth = useOptionalAuth();
  const scope = { tenantId: auth?.currentUser?.tenantId ?? undefined };
  const includeDeleted = options?.includeDeleted ?? true;

  return useQuery({
    queryKey: knowledgeQueryKeys.detail(documentId || '', scope),
    queryFn: ({ signal }) => knowledgeApi.getDocument(documentId!, { signal, includeDeleted }),
    enabled: Boolean(documentId && documentId.trim().length > 0),
    staleTime: 30 * 1000,
    ...options,
  });
}

export function useDocumentIngestionHistory(
  documentId: string | undefined,
  options?: Omit<
    UseQueryOptions<IngestionJobItem[], Error, IngestionJobItem[], readonly unknown[]>,
    'queryKey' | 'queryFn'
  >,
) {
  const auth = useOptionalAuth();
  const scope = { tenantId: auth?.currentUser?.tenantId ?? undefined };

  return useQuery({
    queryKey: knowledgeQueryKeys.ingestion(documentId || '', scope),
    queryFn: ({ signal }) => knowledgeApi.getIngestionHistory(documentId!, { signal }),
    enabled: Boolean(documentId && documentId.trim().length > 0),
    staleTime: 10 * 1000,
    ...options,
  });
}

export function useDocumentPreviewMetadata(
  documentId: string | undefined,
  versionId?: string,
  options?: Omit<
    UseQueryOptions<
      DocumentPreviewMetadataResponse,
      Error,
      DocumentPreviewMetadataResponse,
      readonly unknown[]
    >,
    'queryKey' | 'queryFn'
  >,
) {
  const auth = useOptionalAuth();
  const scope = { tenantId: auth?.currentUser?.tenantId ?? undefined };

  return useQuery({
    queryKey: knowledgeQueryKeys.preview(documentId || '', versionId, scope),
    queryFn: ({ signal }) =>
      knowledgeApi.getPreviewMetadata(documentId!, { versionId }, { signal }),
    enabled: Boolean(documentId && documentId.trim().length > 0),
    staleTime: 60 * 1000,
    ...options,
  });
}

export function useDocumentVersions(
  documentId: string | undefined,
  options?: Omit<
    UseQueryOptions<DocumentVersionItem[], Error, DocumentVersionItem[], readonly unknown[]>,
    'queryKey' | 'queryFn'
  >,
) {
  const auth = useOptionalAuth();
  const scope = { tenantId: auth?.currentUser?.tenantId ?? undefined };

  return useQuery({
    queryKey: knowledgeQueryKeys.versions(documentId || '', scope),
    queryFn: ({ signal }) => knowledgeApi.getDocumentVersions(documentId!, { signal }),
    enabled: Boolean(documentId && documentId.trim().length > 0),
    staleTime: 30 * 1000,
    ...options,
  });
}
