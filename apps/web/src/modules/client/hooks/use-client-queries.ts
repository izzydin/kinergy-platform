import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { clientApi } from '../api/client-api';
import { clientQueryKeys } from '../api/client-query-keys';
import type { SearchClientsQueryParams } from '../types/client.types';

/**
 * Custom TanStack Query Hook: Fetches paginated client profiles with server-side filters.
 *
 * Implements Kinergy React Query Standard:
 * - Cache key governed by authoritative `clientQueryKeys.list(params)`.
 * - `keepPreviousData` provides seamless transitions between pages and filter criteria.
 * - Stale time of 30 seconds avoids redundant fetches on rapid tab/focus switching.
 */
export function useClientList(params?: SearchClientsQueryParams, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: clientQueryKeys.list(params),
    queryFn: () => clientApi.searchClients(params),
    staleTime: 30 * 1000,
    placeholderData: keepPreviousData,
    enabled: options?.enabled ?? true,
  });
}

/**
 * Custom TanStack Query Hook: Fetches a single client profile by ID.
 */
export function useClientDetail(clientId: string | undefined) {
  return useQuery({
    queryKey: clientQueryKeys.detail(clientId ?? ''),
    queryFn: () => clientApi.getClientProfile(clientId!),
    enabled: Boolean(clientId),
    staleTime: 15 * 1000,
  });
}
