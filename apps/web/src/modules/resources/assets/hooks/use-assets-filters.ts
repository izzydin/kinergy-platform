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
    page: state.page,
    limit: state.limit,
    sortState: state.sortState,
    isFiltered:
      Boolean(state.q) ||
      Boolean(state.filters.category) ||
      Boolean(state.filters.status) ||
      Boolean(state.filters.condition) ||
      Boolean(state.filters.facilityId) ||
      Boolean(state.filters.roomId) ||
      Boolean(state.filters.includeDecommissioned),
    actions,
  };
}
