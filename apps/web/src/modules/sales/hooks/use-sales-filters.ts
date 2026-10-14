import { useCallback, useMemo } from 'react';
import { useTableUrlState } from '../../../shared/table';
import {
  type ListSalesQueryParams,
  type SalesFilters,
  type SaleSortField,
  type SaleStatus,
  type UseSalesFiltersReturn,
  VALID_SALE_STATUSES,
} from '../types/sales-query.types';

const ALLOWED_LIMITS = [10, 20, 50, 100] as const;
const DEFAULT_LIMIT = 20;
const DEFAULT_SORT = 'createdAt.desc';

/**
 * Custom Hook: URL-driven Filter, Search, Sorting, and Pagination State for Sales
 *
 * Implements Kinergy Frontend DataTable Standard:
 * - Single source of truth in browser URLSearchParams.
 * - Zero duplicated state in React components or query hooks.
 * - Shareable, bookmarkable URLs that survive page refresh.
 * - Deterministic serialization matching backend `ListSalesQueryDto`.
 */
export function useSalesFilters(): UseSalesFiltersReturn {
  const { state, actions } = useTableUrlState<SalesFilters>({
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
        const normalized = val.trim().toUpperCase() as SaleStatus;
        return VALID_SALE_STATUSES.includes(normalized) ? normalized : undefined;
      },
      clientId: (val) => (val && val.trim().length > 0 ? val.trim() : undefined),
      sourceType: (val) => (val && val.trim().length > 0 ? val.trim().toUpperCase() : undefined),
      sourceReferenceId: (val) => (val && val.trim().length > 0 ? val.trim() : undefined),
      fromDate: (val) => (val && val.trim().length > 0 ? val.trim() : undefined),
      toDate: (val) => (val && val.trim().length > 0 ? val.trim() : undefined),
    },
    filterSerializers: {
      status: (val) => val ?? undefined,
      clientId: (val) => val ?? undefined,
      sourceType: (val) => val ?? undefined,
      sourceReferenceId: (val) => val ?? undefined,
      fromDate: (val) => val ?? undefined,
      toDate: (val) => val ?? undefined,
    },
  });

  const sortState = useMemo(() => {
    if (!state.sortState) {
      return [{ id: 'createdAt', desc: true }];
    }
    return [{ id: state.sortState.id, desc: state.sortState.desc }];
  }, [state.sortState]);

  const params: ListSalesQueryParams = useMemo(() => {
    return {
      q: state.q || undefined,
      search: state.q || undefined,
      page: state.page,
      limit: state.limit,
      sort: state.sort ?? DEFAULT_SORT,
      sortField: (state.sortState?.id as SaleSortField) ?? 'createdAt',
      sortDirection: state.sortState ? (state.sortState.desc ? 'desc' : 'asc') : 'desc',
      clientId: state.filters.clientId,
      status: state.filters.status,
      sourceType: state.filters.sourceType,
      sourceReferenceId: state.filters.sourceReferenceId,
      fromDate: state.filters.fromDate,
      toDate: state.filters.toDate,
    };
  }, [
    state.q,
    state.page,
    state.limit,
    state.sort,
    state.sortState,
    state.filters.clientId,
    state.filters.status,
    state.filters.sourceType,
    state.filters.sourceReferenceId,
    state.filters.fromDate,
    state.filters.toDate,
  ]);

  const setSearch = useCallback(
    (q: string, options?: { immediate?: boolean }) => {
      actions.setQ(q, { immediate: options?.immediate ?? true });
    },
    [actions],
  );

  const setPage = useCallback(
    (page: number) => {
      actions.setPage(page);
    },
    [actions],
  );

  const setLimit = useCallback(
    (limit: number) => {
      actions.setLimit(limit);
    },
    [actions],
  );

  const setSort = useCallback(
    (sort?: string) => {
      actions.setSort(sort);
    },
    [actions],
  );

  const toggleSort = useCallback(
    (field: SaleSortField) => {
      actions.toggleSort(field);
    },
    [actions],
  );

  const setStatus = useCallback(
    (status?: SaleStatus | 'ALL') => {
      if (!status || status === 'ALL') {
        actions.clearFilter('status');
      } else {
        actions.setFilter('status', status);
      }
    },
    [actions],
  );

  const setClientId = useCallback(
    (clientId?: string) => {
      if (!clientId || !clientId.trim()) {
        actions.clearFilter('clientId');
      } else {
        actions.setFilter('clientId', clientId.trim());
      }
    },
    [actions],
  );

  const setSourceType = useCallback(
    (sourceType?: string) => {
      if (!sourceType || !sourceType.trim()) {
        actions.clearFilter('sourceType');
      } else {
        actions.setFilter('sourceType', sourceType.trim().toUpperCase());
      }
    },
    [actions],
  );

  const setSourceReferenceId = useCallback(
    (id?: string) => {
      if (!id || !id.trim()) {
        actions.clearFilter('sourceReferenceId');
      } else {
        actions.setFilter('sourceReferenceId', id.trim());
      }
    },
    [actions],
  );

  const setDateRange = useCallback(
    (fromDate?: string, toDate?: string) => {
      actions.setFilters({
        fromDate: fromDate?.trim() || undefined,
        toDate: toDate?.trim() || undefined,
      });
    },
    [actions],
  );

  const resetFilters = useCallback(() => {
    actions.resetFilters({ preserveSort: true, preserveLimit: true });
  }, [actions]);

  const resetAll = useCallback(() => {
    actions.resetAll();
  }, [actions]);

  return {
    params,
    filters: state.filters,
    q: state.q,
    page: state.page,
    limit: state.limit,
    sort: state.sort,
    sortState,
    isFiltered: state.isFiltered,
    setSearch,
    setPage,
    setLimit,
    setSort,
    toggleSort,
    setStatus,
    setClientId,
    setSourceType,
    setSourceReferenceId,
    setDateRange,
    resetFilters,
    resetAll,
  };
}
