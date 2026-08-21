import { act, renderHook } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { TableUrlParamsConfig } from '../types/table-url-state.types';
import { useTableUrlState } from '../hooks/use-table-url-state';

interface TestFilters {
  status?: 'ACTIVE' | 'INACTIVE' | 'PENDING';
  role?: 'ADMIN' | 'OPERATOR' | 'MEMBER';
}

const testConfig: TableUrlParamsConfig<TestFilters> = {
  defaultPage: 1,
  defaultLimit: 10,
  allowedLimits: [10, 25, 50, 100],
  debounceMs: 200,
  filterParsers: {
    status: (raw) =>
      raw === 'ACTIVE' || raw === 'INACTIVE' || raw === 'PENDING' ? raw : undefined,
    role: (raw) => (raw === 'ADMIN' || raw === 'OPERATOR' || raw === 'MEMBER' ? raw : undefined),
  },
};

function createWrapper(initialUrl = '/') {
  return function TestWrapper({ children }: { children: React.ReactNode }) {
    return <MemoryRouter initialEntries={[initialUrl]}>{children}</MemoryRouter>;
  };
}

describe('useTableUrlState Hook (Track C Step C2.1)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('initializes with deterministic defaults when URL is clean', () => {
    const { result } = renderHook(() => useTableUrlState<TestFilters>(testConfig), {
      wrapper: createWrapper('/'),
    });

    expect(result.current.state.q).toBe('');
    expect(result.current.state.page).toBe(1);
    expect(result.current.state.limit).toBe(10);
    expect(result.current.state.sort).toBeUndefined();
    expect(result.current.state.sortState).toBeUndefined();
    expect(result.current.state.filters).toEqual({});
    expect(result.current.state.isFiltered).toBe(false);
  });

  it('parses initial state correctly from populated URLSearchParams', () => {
    const { result } = renderHook(() => useTableUrlState<TestFilters>(testConfig), {
      wrapper: createWrapper('/?q=john&page=3&limit=25&sort=name.desc&status=ACTIVE&role=ADMIN'),
    });

    expect(result.current.state.q).toBe('john');
    expect(result.current.state.page).toBe(3);
    expect(result.current.state.limit).toBe(25);
    expect(result.current.state.sort).toBe('name.desc');
    expect(result.current.state.sortState).toEqual({ id: 'name', desc: true });
    expect(result.current.state.filters).toEqual({
      status: 'ACTIVE',
      role: 'ADMIN',
    });
    expect(result.current.state.isFiltered).toBe(true);
  });

  it('safely falls back to defaults when URL contains malformed or out-of-range parameters', () => {
    const { result } = renderHook(() => useTableUrlState<TestFilters>(testConfig), {
      wrapper: createWrapper(
        '/?page=-5&limit=999&sort=corrupted.invalid.format&status=UNKNOWN_STATUS',
      ),
    });

    expect(result.current.state.page).toBe(1);
    expect(result.current.state.limit).toBe(10); // 999 not in allowedLimits -> fallback
    expect(result.current.state.sort).toBeUndefined();
    expect(result.current.state.sortState).toBeUndefined();
    expect(result.current.state.filters).toEqual({});
    expect(result.current.state.isFiltered).toBe(false);
  });

  it('debounces search updates and resets page to 1', () => {
    const { result } = renderHook(
      () => {
        const tableState = useTableUrlState<TestFilters>(testConfig);
        const location = useLocation();
        return { tableState, location };
      },
      { wrapper: createWrapper('/?page=4') },
    );

    expect(result.current.tableState.state.page).toBe(4);

    // Trigger debounced search
    act(() => {
      result.current.tableState.actions.setQ('alex');
    });

    // Before timer fires, state is not yet committed
    expect(result.current.location.search).toBe('?page=4');

    // Fast-forward debounce delay
    act(() => {
      jest.advanceTimersByTime(200);
    });

    expect(result.current.tableState.state.q).toBe('alex');
    expect(result.current.tableState.state.page).toBe(1);
    expect(result.current.location.search).toBe('?q=alex');
  });

  it('applies immediate search when requested and resets page to 1', () => {
    const { result } = renderHook(
      () => {
        const tableState = useTableUrlState<TestFilters>(testConfig);
        const location = useLocation();
        return { tableState, location };
      },
      { wrapper: createWrapper('/?page=3') },
    );

    act(() => {
      result.current.tableState.actions.setQ('instant query', { immediate: true });
    });

    expect(result.current.tableState.state.q).toBe('instant query');
    expect(result.current.tableState.state.page).toBe(1);
    expect(result.current.location.search).toBe('?q=instant+query');
  });

  it('updates page while preserving all other query parameters', () => {
    const { result } = renderHook(
      () => {
        const tableState = useTableUrlState<TestFilters>(testConfig);
        const location = useLocation();
        return { tableState, location };
      },
      { wrapper: createWrapper('/?q=john&status=ACTIVE&limit=25') },
    );

    act(() => {
      result.current.tableState.actions.setPage(5);
    });

    expect(result.current.tableState.state.page).toBe(5);
    expect(result.current.tableState.state.q).toBe('john');
    expect(result.current.tableState.state.limit).toBe(25);
    expect(result.current.location.search).toContain('page=5');
    expect(result.current.location.search).toContain('q=john');
    expect(result.current.location.search).toContain('status=ACTIVE');
  });

  it('updates limit and automatically resets page to 1', () => {
    const { result } = renderHook(
      () => {
        const tableState = useTableUrlState<TestFilters>(testConfig);
        const location = useLocation();
        return { tableState, location };
      },
      { wrapper: createWrapper('/?page=7&limit=10') },
    );

    act(() => {
      result.current.tableState.actions.setLimit(50);
    });

    expect(result.current.tableState.state.limit).toBe(50);
    expect(result.current.tableState.state.page).toBe(1);
    expect(result.current.location.search).toContain('limit=50');
  });

  it('sets and clears sorting state', () => {
    const { result } = renderHook(() => useTableUrlState<TestFilters>(testConfig), {
      wrapper: createWrapper('/'),
    });

    act(() => {
      result.current.actions.setSort('createdAt.desc');
    });

    expect(result.current.state.sort).toBe('createdAt.desc');
    expect(result.current.state.sortState).toEqual({ id: 'createdAt', desc: true });

    act(() => {
      result.current.actions.setSort(undefined);
    });

    expect(result.current.state.sort).toBeUndefined();
    expect(result.current.state.sortState).toBeUndefined();
  });

  it('toggles column sort cycling: none -> asc -> desc -> none', () => {
    const { result } = renderHook(() => useTableUrlState<TestFilters>(testConfig), {
      wrapper: createWrapper('/'),
    });

    // 1st click -> asc
    act(() => {
      result.current.actions.toggleSort('email');
    });
    expect(result.current.state.sort).toBe('email.asc');
    expect(result.current.state.sortState).toEqual({ id: 'email', desc: false });

    // 2nd click -> desc
    act(() => {
      result.current.actions.toggleSort('email');
    });
    expect(result.current.state.sort).toBe('email.desc');
    expect(result.current.state.sortState).toEqual({ id: 'email', desc: true });

    // 3rd click -> clear
    act(() => {
      result.current.actions.toggleSort('email');
    });
    expect(result.current.state.sort).toBeUndefined();
    expect(result.current.state.sortState).toBeUndefined();
  });

  it('sets individual and multiple filters and resets page to 1', () => {
    const { result } = renderHook(() => useTableUrlState<TestFilters>(testConfig), {
      wrapper: createWrapper('/?page=4'),
    });

    act(() => {
      result.current.actions.setFilter('status', 'ACTIVE');
    });

    expect(result.current.state.filters.status).toBe('ACTIVE');
    expect(result.current.state.page).toBe(1);

    act(() => {
      result.current.actions.setFilters({ role: 'OPERATOR' });
    });

    expect(result.current.state.filters.status).toBe('ACTIVE');
    expect(result.current.state.filters.role).toBe('OPERATOR');
  });

  it('clears an individual filter and resets page to 1', () => {
    const { result } = renderHook(() => useTableUrlState<TestFilters>(testConfig), {
      wrapper: createWrapper('/?status=ACTIVE&role=ADMIN&page=3'),
    });

    act(() => {
      result.current.actions.clearFilter('status');
    });

    expect(result.current.state.filters.status).toBeUndefined();
    expect(result.current.state.filters.role).toBe('ADMIN');
    expect(result.current.state.page).toBe(1);
  });

  it('resets all filters while preserving sort and limit if requested', () => {
    const { result } = renderHook(
      () => {
        const tableState = useTableUrlState<TestFilters>(testConfig);
        const location = useLocation();
        return { tableState, location };
      },
      {
        wrapper: createWrapper(
          '/?q=query&status=ACTIVE&role=ADMIN&sort=name.asc&limit=50&page=4&nonTableParam=keepMe',
        ),
      },
    );

    act(() => {
      result.current.tableState.actions.resetFilters({
        preserveSort: true,
        preserveLimit: true,
      });
    });

    expect(result.current.tableState.state.q).toBe('');
    expect(result.current.tableState.state.filters).toEqual({});
    expect(result.current.tableState.state.page).toBe(1);
    expect(result.current.tableState.state.sort).toBe('name.asc');
    expect(result.current.tableState.state.limit).toBe(50);
    expect(result.current.location.search).toContain('nonTableParam=keepMe');
  });

  it('resets all table parameters with resetAll while preserving unrelated params', () => {
    const { result } = renderHook(
      () => {
        const tableState = useTableUrlState<TestFilters>(testConfig);
        const location = useLocation();
        return { tableState, location };
      },
      {
        wrapper: createWrapper('/?q=query&status=ACTIVE&sort=name.asc&page=4&tab=overview'),
      },
    );

    act(() => {
      result.current.tableState.actions.resetAll();
    });

    expect(result.current.tableState.state.q).toBe('');
    expect(result.current.tableState.state.filters).toEqual({});
    expect(result.current.tableState.state.sort).toBeUndefined();
    expect(result.current.location.search).toBe('?tab=overview');
  });
});
