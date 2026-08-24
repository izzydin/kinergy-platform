import { useMemo, useCallback } from 'react';
import { useTableUrlState } from '../../../../shared/table';
import type { AssignedClientsFilterParams } from '../types';

export interface TrainerFiltersState {
  readonly status?: string;
  readonly selectedClientId?: string;
}

export function useTrainerFilters() {
  const { state, actions } = useTableUrlState<TrainerFiltersState>({
    paramNames: {
      q: 'search',
      page: 'page',
      limit: 'limit',
      sort: 'sort',
    },
    defaultLimit: 10,
    allowedLimits: [5, 10, 20, 50],
    defaultSort: { id: 'daysRemaining', desc: false },
    filterParsers: {
      status: (val) => val || undefined,
      selectedClientId: (val) => val || undefined,
    },
    filterSerializers: {
      status: (val) => val ?? undefined,
      selectedClientId: (val) => val ?? undefined,
    },
  });

  const statusFilter = state.filters.status || 'ALL';

  // Convert status filter to array for backend
  const backendStatuses = useMemo(() => {
    if (statusFilter === 'ACTIVE') return ['ACTIVE'];
    if (statusFilter === 'FROZEN') return ['FROZEN'];
    if (statusFilter === 'EXPIRING') return ['ACTIVE'];
    return undefined;
  }, [statusFilter]);

  const sortBy =
    (state.sortState?.id as 'daysRemaining' | 'endDate' | 'startDate' | 'assignedAt') ||
    'daysRemaining';
  const sortOrder: 'ASC' | 'DESC' = state.sortState?.desc ? 'DESC' : 'ASC';

  const clientParams: AssignedClientsFilterParams = useMemo(() => {
    return {
      page: state.page,
      limit: state.limit,
      sortBy,
      sortOrder,
      statuses: backendStatuses,
      horizonDays: 7,
    };
  }, [state.page, state.limit, sortBy, sortOrder, backendStatuses]);

  const setStatusFilter = useCallback(
    (status: string) => {
      actions.setFilter('status', status === 'ALL' ? undefined : status);
    },
    [actions],
  );

  const setSelectedClientId = useCallback(
    (clientId?: string) => {
      actions.setFilter('selectedClientId', clientId);
    },
    [actions],
  );

  const setRosterSort = useCallback(
    (newSortBy: 'daysRemaining' | 'endDate' | 'startDate' | 'assignedAt') => {
      if (sortBy === newSortBy) {
        actions.setSort({ id: newSortBy, desc: sortOrder === 'ASC' });
      } else {
        actions.setSort({ id: newSortBy, desc: false });
      }
    },
    [sortBy, sortOrder, actions],
  );

  return {
    clientParams,
    page: state.page,
    limit: state.limit,
    sortBy,
    sortOrder,
    searchTerm: state.q,
    statusFilter,
    selectedClientId: state.filters.selectedClientId,
    isFiltered: state.isFiltered,
    setSearch: actions.setQ,
    setPage: actions.setPage,
    setLimit: actions.setLimit,
    setStatusFilter,
    setSelectedClientId,
    setRosterSort,
    resetFilters: actions.resetFilters,
  };
}
