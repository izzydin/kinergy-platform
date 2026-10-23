import type { SearchClientsQueryParams } from '../types/client.types';
import type { ClientTimelineParams } from '../types/client-timeline.types';

/**
 * Authoritative TanStack Query Key Factory for Client Management
 *
 * Guarantees precise cache targeting and deterministic invalidation across
 * client lists, single client details, and client activity timelines.
 */
export const clientQueryKeys = {
  all: ['clients'] as const,

  // Client Directory List Collection
  lists: () => [...clientQueryKeys.all, 'list'] as const,
  list: (params?: SearchClientsQueryParams) =>
    [...clientQueryKeys.lists(), params ? sanitizeParamsForQueryKey(params) : {}] as const,

  // Single Client Profile Hierarchy
  details: () => [...clientQueryKeys.all, 'detail'] as const,
  detail: (id: string) => [...clientQueryKeys.details(), id] as const,

  // Client Longitudinal Activity Timeline
  timelines: () => [...clientQueryKeys.all, 'timeline'] as const,
  timeline: (id: string, params?: ClientTimelineParams) =>
    [...clientQueryKeys.timelines(), id, params ?? {}] as const,
};

/**
 * Normalizes query parameters object so that empty strings / undefined values
 * produce identical, deterministic cache keys.
 */
function sanitizeParamsForQueryKey(params: SearchClientsQueryParams): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '' && value !== null) {
      clean[key] = value;
    }
  }
  return clean;
}
