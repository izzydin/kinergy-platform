import { createQueryKeyFactory } from '../../../shared/query/query-key-factory';

/**
 * Dashboard Domain Query Key Factory (ADR-FE-0018)
 *
 * Provides type-safe, hierarchical query keys for all Dashboard API endpoints.
 * Used by query hooks and mutations to guarantee deterministic cache invalidation
 * and prevent key collisions with other feature modules.
 *
 * Shape:
 *  dashboardKeys.all                           → ['dashboard']
 *  dashboardKeys.lists()                       → ['dashboard', 'list']
 *  dashboardKeys.metrics()                     → ['dashboard', 'metrics']
 *  dashboardKeys.status()                      → ['dashboard', 'status']
 *  dashboardKeys.activities()                  → ['dashboard', 'activities']
 *  dashboardKeys.activity(id)                  → ['dashboard', 'detail', id]
 */
const _base = createQueryKeyFactory('dashboard');

export const dashboardKeys = {
  ..._base,

  /**
   * Metrics collection — used by useDashboardMetricsQuery
   */
  metrics: () => ['dashboard', 'metrics'] as const,

  /**
   * System status summary — used by useDashboardStatusQuery
   */
  status: () => ['dashboard', 'status'] as const,

  /**
   * Activity feed list — used by useDashboardActivitiesQuery
   */
  activities: () => ['dashboard', 'activities'] as const,

  /**
   * Single activity detail — target for bookmark mutation invalidation
   */
  activity: (id: string) => ['dashboard', 'activities', id] as const,
} as const;
