import { useMemo } from 'react';
import { useTableUrlState } from '../../../../shared/table';
import type { UserListParams, UserRole, UserStatus } from '../domain/user.types';

export interface UserFilters {
  readonly status?: UserStatus;
  readonly role?: UserRole;
}

export interface UseUserFiltersReturn {
  readonly params: UserListParams;
  readonly isFiltered: boolean;
  readonly setSearch: (q: string) => void;
  readonly setStatus: (status: UserStatus | 'ALL') => void;
  readonly setRole: (role: UserRole | 'ALL') => void;
  readonly setPage: (page: number) => void;
  readonly setLimit: (limit: number) => void;
  readonly setSort: (sort?: string) => void;
  readonly toggleSort: (field: string) => void;
  readonly resetFilters: () => void;
  readonly sortState: Array<{ id: string; desc: boolean }>;
}

const VALID_STATUSES: readonly string[] = ['ACTIVE', 'INACTIVE', 'PENDING', 'BLOCKED'];
const VALID_ROLES: readonly string[] = ['ADMIN', 'OPERATOR', 'MEMBER'];

/**
 * Custom Hook: URL-driven Filter, Search, Sorting, and Pagination State
 *
 * Integrates Track C DataTable URL State Infrastructure with User Management.
 * Keeps query parameters strictly synchronized with the URL.
 */
export function useUserFilters(): UseUserFiltersReturn {
  const { state, actions } = useTableUrlState<UserFilters>({
    filterParsers: {
      status: (val) => (val && VALID_STATUSES.includes(val) ? (val as UserStatus) : undefined),
      role: (val) => (val && VALID_ROLES.includes(val) ? (val as UserRole) : undefined),
    },
    defaultLimit: 10,
  });

  const params: UserListParams = useMemo(
    () => ({
      q: state.q || undefined,
      status: state.filters.status,
      role: state.filters.role,
      sort: state.sort,
      page: state.page,
      limit: state.limit,
    }),
    [state.q, state.filters.status, state.filters.role, state.sort, state.page, state.limit],
  );

  const sortState = useMemo(() => {
    if (!state.sortState) return [];
    return [{ id: state.sortState.id, desc: state.sortState.desc }];
  }, [state.sortState]);

  const setStatus = (status: UserStatus | 'ALL') => {
    if (status === 'ALL') {
      actions.clearFilter('status');
    } else {
      actions.setFilter('status', status);
    }
  };

  const setRole = (role: UserRole | 'ALL') => {
    if (role === 'ALL') {
      actions.clearFilter('role');
    } else {
      actions.setFilter('role', role);
    }
  };

  return {
    params,
    isFiltered: state.isFiltered,
    setSearch: (q: string) => actions.setQ(q, { immediate: true }),
    setStatus,
    setRole,
    setPage: actions.setPage,
    setLimit: actions.setLimit,
    setSort: actions.setSort,
    toggleSort: actions.toggleSort,
    resetFilters: actions.resetAll,
    sortState,
  };
}
