import { useCallback, useMemo } from 'react';
import { useTableUrlState } from '../../../../shared/table';
import type { ListDocumentsQueryParams, VisibilityScope } from '../types/knowledge-contract.types';

export interface KnowledgeLibraryFilters {
  readonly visibilityScope?: VisibilityScope;
  readonly mimeType?: string;
  readonly createdFrom?: string;
  readonly createdTo?: string;
}

export type KnowledgeSortField = 'createdAt' | 'updatedAt' | 'title';

const ALLOWED_LIMITS = [10, 20, 50, 100] as const;
const DEFAULT_LIMIT = 20;
const DEFAULT_SORT = 'createdAt.desc';
const VALID_SORT_FIELDS: readonly KnowledgeSortField[] = [
  'createdAt',
  'updatedAt',
  'title',
] as const;

const VALID_VISIBILITY_SCOPES: readonly VisibilityScope[] = [
  'ALL_STAFF',
  'CLINICAL_STAFF',
  'MANAGEMENT',
] as const;

function isAllowedSortField(field: string): field is KnowledgeSortField {
  return VALID_SORT_FIELDS.includes(field as KnowledgeSortField);
}

export function useKnowledgeLibraryFilters() {
  const { state, actions } = useTableUrlState<KnowledgeLibraryFilters>({
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
      visibilityScope: (val) => {
        if (!val) return undefined;
        const normalized = val.trim().toUpperCase() as VisibilityScope;
        return VALID_VISIBILITY_SCOPES.includes(normalized) ? normalized : undefined;
      },
      mimeType: (val) => (val && val.trim().length > 0 ? val.trim() : undefined),
      createdFrom: (val) => (val && val.trim().length > 0 ? val.trim() : undefined),
      createdTo: (val) => (val && val.trim().length > 0 ? val.trim() : undefined),
    },
    filterSerializers: {
      visibilityScope: (val) => val ?? undefined,
      mimeType: (val) => val ?? undefined,
      createdFrom: (val) => val ?? undefined,
      createdTo: (val) => val ?? undefined,
    },
  });

  const resolvedSort = useMemo(() => {
    if (!state.sortState || !isAllowedSortField(state.sortState.id)) {
      return { field: 'createdAt' as KnowledgeSortField, desc: true };
    }
    return {
      field: state.sortState.id as KnowledgeSortField,
      desc: Boolean(state.sortState.desc),
    };
  }, [state.sortState]);

  const queryParams: ListDocumentsQueryParams = useMemo(() => {
    const trimmedSearch = state.q?.trim();
    return {
      page: state.page,
      limit: state.limit,
      search: trimmedSearch && trimmedSearch.length > 0 ? trimmedSearch : undefined,
      visibilityScope: state.filters.visibilityScope,
      mimeType: state.filters.mimeType,
      createdFrom: state.filters.createdFrom,
      createdTo: state.filters.createdTo,
      orderBy: resolvedSort.field,
      orderDirection: resolvedSort.desc ? 'desc' : 'asc',
    };
  }, [state.page, state.limit, state.q, state.filters, resolvedSort]);

  const setSearch = useCallback(
    (term: string) => {
      actions.setQ(term);
    },
    [actions],
  );

  const clearSearch = useCallback(() => {
    actions.setQ('');
  }, [actions]);

  const setVisibilityScope = useCallback(
    (scope: VisibilityScope | undefined) => {
      actions.setFilter('visibilityScope', scope);
    },
    [actions],
  );

  const setMimeType = useCallback(
    (mime: string | undefined) => {
      actions.setFilter('mimeType', mime);
    },
    [actions],
  );

  const setPage = useCallback(
    (newPage: number) => {
      actions.setPage(newPage);
    },
    [actions],
  );

  const setLimit = useCallback(
    (newLimit: number) => {
      actions.setLimit(newLimit);
    },
    [actions],
  );

  const toggleSort = useCallback(
    (field: KnowledgeSortField) => {
      if (resolvedSort.field === field) {
        actions.setSort({ id: field, desc: !resolvedSort.desc });
      } else {
        actions.setSort({ id: field, desc: true });
      }
    },
    [actions, resolvedSort],
  );

  const resetAllFilters = useCallback(() => {
    actions.resetFilters();
  }, [actions]);

  return {
    state,
    queryParams,
    resolvedSort,
    isFiltered: state.isFiltered,
    actions: {
      setSearch,
      clearSearch,
      setVisibilityScope,
      setMimeType,
      setPage,
      setLimit,
      toggleSort,
      resetAllFilters,
    },
  };
}
