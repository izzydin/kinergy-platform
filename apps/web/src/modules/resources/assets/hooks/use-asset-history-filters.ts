import { useMemo } from 'react';
import { useTableUrlState } from '../../../../shared/table';
import { AssetHistoryEventType, type GetAssetHistoryFilterParams } from '../types';

export interface AssetHistoryFiltersState {
  readonly eventType?: AssetHistoryEventType;
}

/**
 * URL-driven filter, sorting, and pagination state hook for the asset lifecycle history ledger.
 * Synchronizes eventType, sort, page, and limit with URLSearchParams.
 */
export function useAssetHistoryFilters() {
  const { state, actions } = useTableUrlState<AssetHistoryFiltersState>({
    paramNames: {
      page: 'page',
      limit: 'limit',
      sort: 'sort',
    },
    defaultLimit: 15,
    allowedLimits: [5, 10, 15, 30, 50],
    defaultSort: 'timestamp.desc',
    filterParsers: {
      eventType: (val) => (val as AssetHistoryEventType) || undefined,
    },
    filterSerializers: {
      eventType: (val) => val ?? undefined,
    },
  });

  const queryParams: GetAssetHistoryFilterParams = useMemo(() => {
    return {
      eventType: state.filters.eventType,
      page: state.page,
      limit: state.limit,
      sortOrder: state.sortState ? (state.sortState.desc ? 'desc' : 'asc') : 'desc',
    };
  }, [state.filters.eventType, state.page, state.limit, state.sortState]);

  return {
    params: queryParams,
    eventType: state.filters.eventType,
    sortOrder: (state.sortState ? (state.sortState.desc ? 'desc' : 'asc') : 'desc') as
      'desc' | 'asc',
    page: state.page,
    limit: state.limit,
    isFiltered: Boolean(state.filters.eventType),
    setEventType: (type?: AssetHistoryEventType) => actions.setFilter('eventType', type),
    setSortOrder: (order: 'asc' | 'desc') =>
      actions.setSort({ id: 'timestamp', desc: order === 'desc' }),
    setPage: actions.setPage,
    setLimit: actions.setLimit,
    resetFilters: actions.resetFilters,
  };
}
