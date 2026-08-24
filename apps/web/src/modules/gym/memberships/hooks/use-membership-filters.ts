import { useMemo } from 'react';
import { useTableUrlState } from '../../../../shared/table';
import type { ListMembershipsFilterParams } from '../types';

export interface MembershipFiltersState {
  readonly clientId?: string;
  readonly planId?: string;
  readonly status?: string;
  readonly startDateFrom?: string;
  readonly startDateTo?: string;
  readonly endDateFrom?: string;
  readonly endDateTo?: string;
}

export function useMembershipFilters() {
  const { state, actions } = useTableUrlState<MembershipFiltersState>({
    paramNames: {
      q: 'search',
      page: 'page',
      limit: 'limit',
      sort: 'sort',
    },
    defaultLimit: 10,
    allowedLimits: [5, 10, 20, 50],
    filterParsers: {
      clientId: (val) => val || undefined,
      planId: (val) => val || undefined,
      status: (val) => val || undefined,
      startDateFrom: (val) => val || undefined,
      startDateTo: (val) => val || undefined,
      endDateFrom: (val) => val || undefined,
      endDateTo: (val) => val || undefined,
    },
    filterSerializers: {
      clientId: (val) => val ?? undefined,
      planId: (val) => val ?? undefined,
      status: (val) => val ?? undefined,
      startDateFrom: (val) => val ?? undefined,
      startDateTo: (val) => val ?? undefined,
      endDateFrom: (val) => val ?? undefined,
      endDateTo: (val) => val ?? undefined,
    },
  });

  const queryParams: ListMembershipsFilterParams = useMemo(() => {
    return {
      clientId: state.filters.clientId || (state.q ? state.q : undefined),
      planId: state.filters.planId,
      status: state.filters.status,
      startDateFrom: state.filters.startDateFrom,
      startDateTo: state.filters.startDateTo,
      endDateFrom: state.filters.endDateFrom,
      endDateTo: state.filters.endDateTo,
      page: state.page,
      limit: state.limit,
    };
  }, [
    state.filters.clientId,
    state.filters.planId,
    state.filters.status,
    state.filters.startDateFrom,
    state.filters.startDateTo,
    state.filters.endDateFrom,
    state.filters.endDateTo,
    state.q,
    state.page,
    state.limit,
  ]);

  return {
    params: queryParams,
    search: state.q,
    clientId: state.filters.clientId,
    planId: state.filters.planId,
    status: state.filters.status,
    startDateFrom: state.filters.startDateFrom,
    startDateTo: state.filters.startDateTo,
    endDateFrom: state.filters.endDateFrom,
    endDateTo: state.filters.endDateTo,
    page: state.page,
    limit: state.limit,
    isFiltered: state.isFiltered,
    sortState: state.sortState,
    setSearch: actions.setQ,
    setClientId: (clientId?: string) => actions.setFilter('clientId', clientId),
    setPlanId: (planId?: string) => actions.setFilter('planId', planId),
    setStatus: (status?: string) => actions.setFilter('status', status),
    setDateRange: (range: {
      startDateFrom?: string;
      startDateTo?: string;
      endDateFrom?: string;
      endDateTo?: string;
    }) => actions.setFilters(range),
    setPage: actions.setPage,
    setLimit: actions.setLimit,
    setSort: actions.setSort,
    resetFilters: actions.resetFilters,
  };
}
