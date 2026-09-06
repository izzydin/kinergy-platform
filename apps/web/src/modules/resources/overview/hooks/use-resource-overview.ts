import { useQuery } from '@tanstack/react-query';
import { resourceOverviewApi, resourceOverviewQueryKeys } from '../api';
import type { GetResourceOverviewParams, ResourceOverviewVM } from '../types';

export interface UseResourceOverviewOptions {
  enabled?: boolean;
}

/**
 * Retrieves synthesized executive resource overview metrics combining consumable inventory
 * and fixed assets telemetry.
 *
 * Cache Behavior:
 * - staleTime: 60 seconds (1 minute executive fresh window)
 * - gcTime: standard TanStack Query cache preservation
 */
export function useResourceOverview(
  params?: GetResourceOverviewParams,
  options?: UseResourceOverviewOptions,
) {
  return useQuery<ResourceOverviewVM, Error>({
    queryKey: resourceOverviewQueryKeys.dashboard(params),
    queryFn: () => resourceOverviewApi.getOverview(params),
    enabled: options?.enabled ?? true,
    staleTime: 60 * 1000,
  });
}
