import { useCallback, useMemo } from 'react';
import type { OnChangeFn, SortingState } from '@tanstack/react-table';
import { useTableUrlState } from '../../../shared/table';
import {
  type ClientFilters,
  type ClientSortDirection,
  type ClientSortDirectionUpper,
  type ClientSortField,
  type ClientStatus,
  type SearchClientsQueryParams,
  type UseClientFiltersReturn,
  VALID_CLIENT_STATUSES,
} from '../types/client.types';

const ALLOWED_LIMITS = [10, 20, 50, 100] as const;
const DEFAULT_LIMIT = 10;
const DEFAULT_SORT = 'createdAt.desc';

/**
 * Custom Hook: URL-driven Filter, Search, Sorting, and Pagination State for Client Management
 *
 * Implements Kinergy Frontend DataTable Standard:
 * - Single source of truth in browser URLSearchParams.
 * - Shareable, bookmarkable URLs that survive page refresh.
 * - Deterministic serialization matching backend `SearchClientsQueryDto`.
 * - Automatic page reset (page=1) on search, filter, and sorting mutations.
 */
export function useClientFilters(): UseClientFiltersReturn {
  const { state, actions } = useTableUrlState<ClientFilters>({
    paramNames: {
      q: 'q',
      page: 'page',
      limit: 'limit',
      sort: 'sort',
    },
    defaultPage: 1,
    defaultLimit: DEFAULT_LIMIT,
    allowedLimits: ALLOWED_LIMITS,
    defaultSort: DEFAULT_SORT,
    filterParsers: {
      status: (val) => {
        if (!val) return undefined;
        const normalized = val.trim().toUpperCase() as ClientStatus;
        return VALID_CLIENT_STATUSES.includes(normalized) ? normalized : undefined;
      },
      includeArchived: (val) => {
        if (val === 'true') return true;
        if (val === 'false') return false;
        return undefined;
      },
      createdFrom: (val) => (val && val.trim().length > 0 ? val.trim() : undefined),
      createdTo: (val) => (val && val.trim().length > 0 ? val.trim() : undefined),
    },
    filterSerializers: {
      status: (val) => val ?? undefined,
      includeArchived: (val) => (val === true ? 'true' : undefined),
      createdFrom: (val) => val ?? undefined,
      createdTo: (val) => val ?? undefined,
    },
  });

  // Parse sorting state for TanStack Table header bindings
  const sortState: SortingState = useMemo(() => {
    if (!state.sortState) {
      return [{ id: 'createdAt', desc: true }];
    }
    return [
      {
        id: state.sortState.id,
        desc: state.sortState.desc,
      },
    ];
  }, [state.sortState]);

  const sortField: ClientSortField = useMemo(() => {
    const rawId = state.sortState?.id;
    if (rawId === 'name' || rawId === 'updatedAt') {
      return rawId;
    }
    return 'createdAt';
  }, [state.sortState?.id]);

  const sortDirection: ClientSortDirection = state.sortState?.desc ? 'desc' : 'asc';
  const sortOrderUpper: ClientSortDirectionUpper = sortDirection === 'desc' ? 'DESC' : 'ASC';

  // Construct strongly typed query parameters matching SearchClientsQueryDto
  const params: SearchClientsQueryParams = useMemo(() => {
    const qValue = state.q.trim();
    return {
      page: state.page,
      limit: state.limit,
      query: qValue ? qValue : undefined,
      q: qValue ? qValue : undefined,
      status: state.filters.status,
      includeArchived: state.filters.includeArchived,
      createdFrom: state.filters.createdFrom,
      createdTo: state.filters.createdTo,
      sortBy: sortField,
      sortOrder: sortOrderUpper,
      sort: state.sort,
    };
  }, [
    state.page,
    state.limit,
    state.q,
    state.filters.status,
    state.filters.includeArchived,
    state.filters.createdFrom,
    state.filters.createdTo,
    sortField,
    sortOrderUpper,
    state.sort,
  ]);

  // Adapt TanStack table sorting changes to useClientFilters setSort
  const handleSortingChange: OnChangeFn<SortingState> = useCallback(
    (updaterOrValue) => {
      const nextSorting =
        typeof updaterOrValue === 'function' ? updaterOrValue(sortState) : updaterOrValue;

      if (!nextSorting || nextSorting.length === 0 || !nextSorting[0]) {
        actions.setSort(DEFAULT_SORT);
      } else {
        const primary = nextSorting[0];
        const field = primary.id as ClientSortField;
        const direction = primary.desc ? 'desc' : 'asc';
        actions.setSort(`${field}.${direction}`);
      }
    },
    [sortState, actions],
  );

  const setSearch = useCallback(
    (term: string, options?: { immediate?: boolean }) => {
      actions.setQ(term, { immediate: options?.immediate ?? true });
    },
    [actions],
  );

  const setPage = useCallback((page: number) => actions.setPage(page), [actions]);

  const setLimit = useCallback((limit: number) => actions.setLimit(limit), [actions]);

  const setSort = useCallback((sort?: string) => actions.setSort(sort ?? DEFAULT_SORT), [actions]);

  const setStatus = useCallback(
    (status?: ClientStatus) => actions.setFilter('status', status),
    [actions],
  );

  const setIncludeArchived = useCallback(
    (include?: boolean) => actions.setFilter('includeArchived', include),
    [actions],
  );

  const setDateRange = useCallback(
    (createdFrom?: string, createdTo?: string) => {
      actions.setFilters({
        createdFrom,
        createdTo,
      });
    },
    [actions],
  );

  const resetFilters = useCallback(() => {
    actions.resetFilters({ preserveSort: true, preserveLimit: true });
  }, [actions]);

  return {
    params,
    q: state.q,
    page: state.page,
    limit: state.limit,
    sort: state.sort ?? DEFAULT_SORT,
    sortField,
    sortDirection,
    sortState,
    filters: state.filters,
    isFiltered: state.isFiltered,
    setSearch,
    setPage,
    setLimit,
    setSort,
    handleSortingChange,
    setStatus,
    setIncludeArchived,
    setDateRange,
    resetFilters,
  };
}
