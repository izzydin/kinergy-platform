import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import type {
  SortState,
  TableUrlActions,
  TableUrlParamsConfig,
  TableUrlState,
  UseTableUrlStateReturn,
} from '../types/table-url-state.types';
import {
  parseFilterParams,
  parseLimitParam,
  parsePageParam,
  parseSortParam,
  serializeFilterParams,
  serializeSortParam,
} from '../utils/table-url-serializer';

/**
 * Reusable Hook: URL-driven Table State Engine
 *
 * Implements Track C — Step C2.1 DataTable URL State Infrastructure.
 * Synchronizes search query, filters, pagination, and sorting directly with URLSearchParams.
 *
 * Guarantees:
 * 1. Single source of truth in the browser URL.
 * 2. Debounced search updates without excessive history entries.
 * 3. Automatic page reset (page=1) on search and filter changes.
 * 4. Resilient parsing with safe fallbacks for malformed or missing parameters.
 */
export function useTableUrlState<TFilters extends object = Record<string, unknown>>(
  config: TableUrlParamsConfig<TFilters> = {},
): UseTableUrlStateReturn<TFilters> {
  const [searchParams, setSearchParams] = useSearchParams();

  const qKey = config.paramNames?.q ?? 'q';
  const pageKey = config.paramNames?.page ?? 'page';
  const limitKey = config.paramNames?.limit ?? 'limit';
  const sortKey = config.paramNames?.sort ?? 'sort';

  const defaultPage = config.defaultPage ?? 1;
  const defaultLimit = config.defaultLimit ?? 10;
  const debounceMs = config.debounceMs ?? 300;
  const isReplace = config.navigationMethod !== 'push';

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // 1. Parse Current State from URLSearchParams
  const q = searchParams.get(qKey) ?? '';
  const page = parsePageParam(searchParams.get(pageKey), defaultPage);
  const limit = parseLimitParam(searchParams.get(limitKey), defaultLimit, config.allowedLimits);

  const defaultSortSerialized = useMemo(() => {
    if (!config.defaultSort) return undefined;
    return typeof config.defaultSort === 'string'
      ? config.defaultSort
      : serializeSortParam(config.defaultSort);
  }, [config.defaultSort]);

  const rawSort = searchParams.get(sortKey);
  const sortState = useMemo(() => {
    const candidate = rawSort ?? defaultSortSerialized;
    return parseSortParam(candidate);
  }, [rawSort, defaultSortSerialized]);

  const sort = useMemo(() => {
    return sortState ? serializeSortParam(sortState) : undefined;
  }, [sortState]);

  const filters = useMemo(
    () => parseFilterParams<TFilters>(searchParams, config.filterParsers),
    [searchParams, config.filterParsers],
  );

  const isFiltered = useMemo(() => {
    return Boolean(q.trim()) || Object.keys(filters).length > 0;
  }, [q, filters]);

  const state: TableUrlState<TFilters> = useMemo(
    () => ({
      q,
      page,
      limit,
      sort,
      sortState,
      filters,
      isFiltered,
    }),
    [q, page, limit, sort, sortState, filters, isFiltered],
  );

  // 2. State Mutation Helpers
  const updateParams = useCallback(
    (updater: (prev: URLSearchParams) => void, immediate = true) => {
      if (!immediate) return;
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          updater(next);
          return next;
        },
        { replace: isReplace },
      );
    },
    [setSearchParams, isReplace],
  );

  const setQ = useCallback(
    (newQuery: string, options?: { immediate?: boolean }) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      const applySearch = () => {
        updateParams((prev) => {
          const trimmed = newQuery.trim();
          if (trimmed) {
            prev.set(qKey, trimmed);
          } else {
            prev.delete(qKey);
          }
          prev.delete(pageKey);
        });
      };

      if (options?.immediate || debounceMs <= 0) {
        applySearch();
      } else {
        debounceTimerRef.current = setTimeout(applySearch, debounceMs);
      }
    },
    [debounceMs, qKey, pageKey, updateParams],
  );

  const setPage = useCallback(
    (newPage: number) => {
      const sanitized = Math.max(1, Math.floor(newPage));
      updateParams((prev) => {
        if (sanitized === defaultPage) {
          prev.delete(pageKey);
        } else {
          prev.set(pageKey, String(sanitized));
        }
      });
    },
    [defaultPage, pageKey, updateParams],
  );

  const setLimit = useCallback(
    (newLimit: number) => {
      const sanitized = parseLimitParam(String(newLimit), defaultLimit, config.allowedLimits);
      updateParams((prev) => {
        if (sanitized === defaultLimit) {
          prev.delete(limitKey);
        } else {
          prev.set(limitKey, String(sanitized));
        }
        prev.delete(pageKey);
      });
    },
    [defaultLimit, config.allowedLimits, limitKey, pageKey, updateParams],
  );

  const setSort = useCallback(
    (newSort: string | SortState | undefined) => {
      updateParams((prev) => {
        const serialized = serializeSortParam(newSort);
        if (serialized && serialized !== defaultSortSerialized) {
          prev.set(sortKey, serialized);
        } else {
          prev.delete(sortKey);
        }
      });
    },
    [defaultSortSerialized, sortKey, updateParams],
  );

  const toggleSort = useCallback(
    (columnId: string) => {
      if (!columnId) return;

      const currentSort = sortState;
      let nextSort: SortState | undefined;

      if (!currentSort || currentSort.id !== columnId) {
        nextSort = { id: columnId, desc: false };
      } else if (!currentSort.desc) {
        nextSort = { id: columnId, desc: true };
      } else {
        nextSort = undefined; // Cycle to clear
      }

      setSort(nextSort);
    },
    [sortState, setSort],
  );

  const setFilter = useCallback(
    <K extends keyof TFilters>(key: K, value: TFilters[K] | undefined) => {
      updateParams((prev) => {
        serializeFilterParams<TFilters>(
          { [key]: value } as unknown as Partial<TFilters>,
          prev,
          config.filterSerializers,
        );
        prev.delete(pageKey);
      });
    },
    [config.filterSerializers, pageKey, updateParams],
  );

  const setFilters = useCallback(
    (newFilters: Partial<TFilters>) => {
      updateParams((prev) => {
        serializeFilterParams<TFilters>(newFilters, prev, config.filterSerializers);
        prev.delete(pageKey);
      });
    },
    [config.filterSerializers, pageKey, updateParams],
  );

  const clearFilter = useCallback(
    (key: keyof TFilters) => {
      updateParams((prev) => {
        prev.delete(String(key));
        prev.delete(pageKey);
      });
    },
    [pageKey, updateParams],
  );

  const resetFilters = useCallback(
    (options?: { preserveSort?: boolean; preserveLimit?: boolean }) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      updateParams((prev) => {
        // Clear search
        prev.delete(qKey);

        // Clear configured filters
        if (config.filterParsers) {
          for (const key of Object.keys(config.filterParsers)) {
            prev.delete(key);
          }
        }

        // Reset page
        prev.delete(pageKey);

        if (!options?.preserveLimit) {
          prev.delete(limitKey);
        }

        if (!options?.preserveSort) {
          prev.delete(sortKey);
        }
      });
    },
    [config.filterParsers, limitKey, pageKey, qKey, sortKey, updateParams],
  );

  const resetAll = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    updateParams((prev) => {
      prev.delete(qKey);
      prev.delete(pageKey);
      prev.delete(limitKey);
      prev.delete(sortKey);

      if (config.filterParsers) {
        for (const key of Object.keys(config.filterParsers)) {
          prev.delete(key);
        }
      }
    });
  }, [config.filterParsers, limitKey, pageKey, qKey, sortKey, updateParams]);

  const actions: TableUrlActions<TFilters> = useMemo(
    () => ({
      setQ,
      setPage,
      setLimit,
      setSort,
      toggleSort,
      setFilter,
      setFilters,
      clearFilter,
      resetFilters,
      resetAll,
    }),
    [
      setQ,
      setPage,
      setLimit,
      setSort,
      toggleSort,
      setFilter,
      setFilters,
      clearFilter,
      resetFilters,
      resetAll,
    ],
  );

  return {
    state,
    actions,
  };
}
