import { useMemo } from 'react';
import { useTableUrlState } from '../../../../shared/table';
import { InventoryCategory, InventoryItemStatus, type ListInventoryFilterParams } from '../types';

export interface InventoryFiltersState {
  readonly category?: InventoryCategory;
  readonly status?: InventoryItemStatus;
  readonly stockStatus?: 'ALL' | 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
  readonly includeArchived?: boolean;
}

export function useInventoryFilters() {
  const { state, actions } = useTableUrlState<InventoryFiltersState>({
    paramNames: {
      q: 'search',
      page: 'page',
      limit: 'limit',
      sort: 'sort',
    },
    defaultLimit: 10,
    allowedLimits: [5, 10, 20, 50],
    filterParsers: {
      category: (val) => (val as InventoryCategory) || undefined,
      status: (val) => (val as InventoryItemStatus) || undefined,
      stockStatus: (val) => (val as 'ALL' | 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK') || undefined,
      includeArchived: (val) => (val === 'true' ? true : undefined),
    },
    filterSerializers: {
      category: (val) => val ?? undefined,
      status: (val) => val ?? undefined,
      stockStatus: (val) => val ?? undefined,
      includeArchived: (val) => (val ? 'true' : undefined),
    },
  });

  const queryParams: ListInventoryFilterParams = useMemo(() => {
    return {
      search: state.q || undefined,
      category: state.filters.category,
      status: state.filters.status,
      stockStatus: state.filters.stockStatus,
      includeArchived: state.filters.includeArchived,
      page: state.page,
      limit: state.limit,
      sortBy: state.sortState?.id as ListInventoryFilterParams['sortBy'],
      sortOrder: state.sortState ? (state.sortState.desc ? 'desc' : 'asc') : undefined,
    };
  }, [
    state.q,
    state.filters.category,
    state.filters.status,
    state.filters.stockStatus,
    state.filters.includeArchived,
    state.page,
    state.limit,
    state.sortState,
  ]);

  return {
    params: queryParams,
    search: state.q,
    category: state.filters.category,
    status: state.filters.status,
    stockStatus: state.filters.stockStatus,
    includeArchived: state.filters.includeArchived,
    page: state.page,
    limit: state.limit,
    isFiltered: state.isFiltered,
    sortState: state.sortState,
    setSearch: actions.setQ,
    setCategory: (category?: InventoryCategory) => actions.setFilter('category', category),
    setStatus: (status?: InventoryItemStatus) => actions.setFilter('status', status),
    setStockStatus: (stockStatus?: 'ALL' | 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK') =>
      actions.setFilter('stockStatus', stockStatus),
    setIncludeArchived: (includeArchived?: boolean) =>
      actions.setFilter('includeArchived', includeArchived),
    setPage: actions.setPage,
    setLimit: actions.setLimit,
    setSort: actions.setSort,
    resetFilters: actions.resetFilters,
  };
}
