import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { UserListParams, UserRole, UserStatus } from '../domain/user.types';

export interface UseUserFiltersReturn {
  readonly params: UserListParams;
  readonly isFiltered: boolean;
  readonly setSearch: (q: string) => void;
  readonly setStatus: (status: UserStatus | 'ALL') => void;
  readonly setRole: (role: UserRole | 'ALL') => void;
  readonly setPage: (page: number) => void;
  readonly resetFilters: () => void;
}

/**
 * Custom Hook: URL-driven Filter, Search, and Pagination State
 *
 * Keeps search query, status filter, role filter, and page index synchronized
 * strictly with URL query parameters (`useSearchParams`). Zero state duplication.
 */
export function useUserFilters(): UseUserFiltersReturn {
  const [searchParams, setSearchParams] = useSearchParams();

  const q = searchParams.get('q') ?? '';
  const statusRaw = searchParams.get('status');
  const roleRaw = searchParams.get('role');
  const pageRaw = searchParams.get('page');
  const limitRaw = searchParams.get('limit');

  const status = (
    ['ACTIVE', 'INACTIVE', 'PENDING', 'BLOCKED'].includes(statusRaw ?? '') ? statusRaw : undefined
  ) as UserStatus | undefined;

  const role = (['ADMIN', 'OPERATOR', 'MEMBER'].includes(roleRaw ?? '') ? roleRaw : undefined) as
    UserRole | undefined;

  const page = pageRaw ? Math.max(1, parseInt(pageRaw, 10) || 1) : 1;
  const limit = limitRaw ? Math.max(1, parseInt(limitRaw, 10) || 10) : 10;

  const params: UserListParams = useMemo(
    () => ({
      q: q || undefined,
      status,
      role,
      page,
      limit,
    }),
    [q, status, role, page, limit],
  );

  const isFiltered = useMemo(() => Boolean(q || status || role), [q, status, role]);

  const updateParams = useCallback(
    (updater: (prev: URLSearchParams) => void) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          updater(next);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setSearch = useCallback(
    (newQ: string) => {
      updateParams((prev) => {
        if (newQ.trim()) {
          prev.set('q', newQ.trim());
        } else {
          prev.delete('q');
        }
        prev.set('page', '1');
      });
    },
    [updateParams],
  );

  const setStatus = useCallback(
    (newStatus: UserStatus | 'ALL') => {
      updateParams((prev) => {
        if (newStatus !== 'ALL') {
          prev.set('status', newStatus);
        } else {
          prev.delete('status');
        }
        prev.set('page', '1');
      });
    },
    [updateParams],
  );

  const setRole = useCallback(
    (newRole: UserRole | 'ALL') => {
      updateParams((prev) => {
        if (newRole !== 'ALL') {
          prev.set('role', newRole);
        } else {
          prev.delete('role');
        }
        prev.set('page', '1');
      });
    },
    [updateParams],
  );

  const setPage = useCallback(
    (newPage: number) => {
      updateParams((prev) => {
        if (newPage > 1) {
          prev.set('page', String(newPage));
        } else {
          prev.delete('page');
        }
      });
    },
    [updateParams],
  );

  const resetFilters = useCallback(() => {
    updateParams((prev) => {
      prev.delete('q');
      prev.delete('status');
      prev.delete('role');
      prev.set('page', '1');
    });
  }, [updateParams]);

  return {
    params,
    isFiltered,
    setSearch,
    setStatus,
    setRole,
    setPage,
    resetFilters,
  };
}
