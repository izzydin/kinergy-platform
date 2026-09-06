import type { GetResourceOverviewParams } from '../types';

/**
 * Authoritative TanStack Query Key Factory for Resource Overview Dashboard
 */
export const resourceOverviewQueryKeys = {
  all: ['resources', 'overview'] as const,

  // Resource Overview Executive Dashboard Metrics
  dashboard: (params?: GetResourceOverviewParams) =>
    [...resourceOverviewQueryKeys.all, 'dashboard', params ?? {}] as const,
};
