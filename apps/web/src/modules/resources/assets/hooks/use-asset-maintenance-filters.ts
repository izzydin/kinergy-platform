import { useMemo } from 'react';
import { useTableUrlState } from '../../../../shared/table';
import type { GetMaintenanceHistoryFilterParams } from '../types';

export interface AssetMaintenanceFiltersState {
  readonly performedBy?: string;
}

/**
 * URL-driven filter and pagination state hook for the asset maintenance ledger.
 * Synchronizes performedBy technician search, page, and limit with URLSearchParams.
 */
export function useAssetMaintenanceFilters() {
  const { state, actions } = useTableUrlState<AssetMaintenanceFiltersState>({
    paramNames: {
      q: 'performedBy',
      page: 'page',
      limit: 'limit',
    },
    defaultLimit: 10,
    allowedLimits: [5, 10, 20, 50],
  });

  const queryParams: GetMaintenanceHistoryFilterParams = useMemo(() => {
    return {
      performedBy: state.q || undefined,
      page: state.page,
      limit: state.limit,
    };
  }, [state.q, state.page, state.limit]);

  return {
    params: queryParams,
    performedBy: state.q,
    page: state.page,
    limit: state.limit,
    isFiltered: Boolean(state.q.trim()),
    setPerformedBy: actions.setQ,
    setPage: actions.setPage,
    setLimit: actions.setLimit,
    resetFilters: actions.resetFilters,
  };
}
