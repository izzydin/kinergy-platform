import { useMemo } from 'react';
import { useTableUrlState } from '../../../../shared/table';
import {
  AssetCategory,
  AssetStatus,
  AssetCondition,
  type ListFixedAssetsFilterParams,
} from '../types';

export interface AssetFiltersState {
  readonly category?: AssetCategory;
  readonly status?: AssetStatus;
  readonly condition?: AssetCondition;
  readonly facilityId?: string;
  readonly roomId?: string;
  readonly includeDecommissioned?: boolean;
}

export function useAssetsFilters() {
  const { state, actions } = useTableUrlState<AssetFiltersState>({
    paramNames: {
      q: 'search',
      page: 'page',
      limit: 'limit',
      sort: 'sort',
    },
    defaultLimit: 10,
    allowedLimits: [5, 10, 20, 50],
    filterParsers: {
      category: (val) => (val as AssetCategory) || undefined,
      status: (val) => (val as AssetStatus) || undefined,
      condition: (val) => (val as AssetCondition) || undefined,
      facilityId: (val) => (typeof val === 'string' && val.trim() ? val.trim() : undefined),
      roomId: (val) => (typeof val === 'string' && val.trim() ? val.trim() : undefined),
      includeDecommissioned: (val) => (val === 'true' ? true : undefined),
    },
    filterSerializers: {
      category: (val) => val ?? undefined,
      status: (val) => val ?? undefined,
      condition: (val) => val ?? undefined,
      facilityId: (val) => val ?? undefined,
      roomId: (val) => val ?? undefined,
      includeDecommissioned: (val) => (val ? 'true' : undefined),
    },
  });

  const queryParams: ListFixedAssetsFilterParams = useMemo(() => {
    return {
      search: state.q || undefined,
      category: state.filters.category,
      status: state.filters.status,
      condition: state.filters.condition,
      facilityId: state.filters.facilityId,
      roomId: state.filters.roomId,
      includeDecommissioned: state.filters.includeDecommissioned,
      page: state.page,
      limit: state.limit,
      sortBy: state.sortState?.id,
      sortOrder: state.sortState ? (state.sortState.desc ? 'desc' : 'asc') : undefined,
    };
  }, [
    state.q,
    state.filters.category,
    state.filters.status,
    state.filters.condition,
    state.filters.facilityId,
    state.filters.roomId,
    state.filters.includeDecommissioned,
    state.page,
    state.limit,
    state.sortState,
  ]);

  return {
    params: queryParams,
    search: state.q,
    filters: state.filters,
    category: state.filters.category,
    status: state.filters.status,
    condition: state.filters.condition,
    facilityId: state.filters.facilityId,
    roomId: state.filters.roomId,
    includeDecommissioned: state.filters.includeDecommissioned,
    page: state.page,
    limit: state.limit,
    sortState: state.sortState,
    isFiltered: state.isFiltered,
    setSearch: actions.setQ,
    setCategory: (category?: AssetCategory) => actions.setFilter('category', category),
    setStatus: (status?: AssetStatus) => actions.setFilter('status', status),
    setCondition: (condition?: AssetCondition) => actions.setFilter('condition', condition),
    setFacilityId: (facilityId?: string) => actions.setFilter('facilityId', facilityId),
    setRoomId: (roomId?: string) => actions.setFilter('roomId', roomId),
    setIncludeDecommissioned: (includeDecommissioned?: boolean) =>
      actions.setFilter('includeDecommissioned', includeDecommissioned),
    setPage: actions.setPage,
    setLimit: actions.setLimit,
    setSort: actions.setSort,
    resetFilters: actions.resetFilters,
    actions,
  };
}
