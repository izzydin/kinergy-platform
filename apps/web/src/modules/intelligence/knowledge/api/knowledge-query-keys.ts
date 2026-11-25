import type { ListDocumentsQueryParams } from '../types/knowledge-contract.types';

export interface KnowledgeQueryScope {
  readonly tenantId?: string;
  readonly userId?: string;
}

export function sanitizeKnowledgeQueryParams<T extends Record<string, unknown>>(
  params?: T,
): Record<string, unknown> {
  if (!params) {
    return {};
  }

  const sanitized: Record<string, unknown> = {};
  const keys = Object.keys(params).sort();

  for (const key of keys) {
    const value = params[key];
    if (value !== undefined && value !== null && value !== '') {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Centralized TanStack Query Key Factory for Knowledge Center.
 *
 * Enforces hierarchical key structure:
 * - `all`: Root for all knowledge queries.
 * - `userScope`: Tenant/user isolated root.
 * - `capabilities`: Authoritative backend upload capabilities and format constraints.
 * - `lists`: Invalidation boundary for all document lists.
 * - `list`: Granular query key for filtered/paginated list.
 * - `details`: Invalidation boundary for single document detail views.
 * - `detail`: Granular single document detail query key.
 * - `ingestions`: Invalidation boundary for ingestion job history.
 * - `ingestion`: Specific document ingestion job query key.
 */
export const knowledgeQueryKeys = {
  all: ['ai-knowledge'] as const,

  userScope: (scope?: KnowledgeQueryScope) =>
    [...knowledgeQueryKeys.all, scope?.tenantId ?? 'default_tenant'] as const,

  capabilities: (scope?: KnowledgeQueryScope) =>
    [...knowledgeQueryKeys.userScope(scope), 'capabilities'] as const,

  lists: (scope?: KnowledgeQueryScope) =>
    [...knowledgeQueryKeys.userScope(scope), 'documents', 'list'] as const,

  list: (params?: ListDocumentsQueryParams, scope?: KnowledgeQueryScope) =>
    [
      ...knowledgeQueryKeys.lists(scope),
      sanitizeKnowledgeQueryParams(params as Record<string, unknown>),
    ] as const,

  details: (scope?: KnowledgeQueryScope) =>
    [...knowledgeQueryKeys.userScope(scope), 'documents', 'detail'] as const,

  detail: (documentId: string, scope?: KnowledgeQueryScope) =>
    [...knowledgeQueryKeys.details(scope), documentId] as const,

  ingestions: (scope?: KnowledgeQueryScope) =>
    [...knowledgeQueryKeys.userScope(scope), 'documents', 'ingestion'] as const,

  ingestion: (documentId: string, scope?: KnowledgeQueryScope) =>
    [...knowledgeQueryKeys.ingestions(scope), documentId] as const,

  preview: (documentId: string, versionId?: string, scope?: KnowledgeQueryScope) =>
    [...knowledgeQueryKeys.details(scope), documentId, 'preview', versionId ?? 'latest'] as const,

  versions: (documentId: string, scope?: KnowledgeQueryScope) =>
    [...knowledgeQueryKeys.details(scope), documentId, 'versions'] as const,
};
