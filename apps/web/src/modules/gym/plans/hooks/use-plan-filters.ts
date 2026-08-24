import { useMemo } from 'react';
import { useTableUrlState } from '../../../../shared/table';
import type { ListMembershipPlansFilterParams } from '../types';

export interface PlanFiltersState {
  readonly status?: string;
  readonly activeOnly?: boolean;
}

export function usePlanFilters() {
  const { state, actions } = useTableUrlState<PlanFiltersState>({
    paramNames: {
      q: 'search',
      page: 'page',
      limit: 'limit',
      sort: 'sort',
    },
    defaultLimit: 10,
    allowedLimits: [5, 10, 20, 50],
    filterParsers: {
      status: (val) => val || undefined,
      activeOnly: (val) => (val === 'true' ? true : undefined),
    },
    filterSerializers: {
      status: (val) => val ?? undefined,
      activeOnly: (val) => (val ? 'true' : undefined),
    },
  });

  const queryParams: ListMembershipPlansFilterParams = useMemo(() => {
    return {
      search: state.q || undefined,
      status: state.filters.status,
      activeOnly: state.filters.activeOnly,
      page: state.page,
      limit: state.limit,
    };
  }, [state.q, state.filters.status, state.filters.activeOnly, state.page, state.limit]);

  return {
    params: queryParams,
    search: state.q,
    status: state.filters.status,
    activeOnly: state.filters.activeOnly,
    page: state.page,
    limit: state.limit,
    isFiltered: state.isFiltered,
    sortState: state.sortState,
    setSearch: actions.setQ,
    setStatus: (status?: string) => actions.setFilter('status', status),
    setActiveOnly: (activeOnly?: boolean) => actions.setFilter('activeOnly', activeOnly),
    setPage: actions.setPage,
    setLimit: actions.setLimit,
    setSort: actions.setSort,
    resetFilters: actions.resetFilters,
  };
}
