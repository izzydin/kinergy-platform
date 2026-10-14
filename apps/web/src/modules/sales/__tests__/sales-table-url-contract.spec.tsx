import '@testing-library/jest-dom';
import { act, renderHook } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { useSalesFilters } from '../hooks/use-sales-filters';
import type { SaleStatus } from '../types/sales-query.types';

function createWrapper(initialUrl = '/sales') {
  return function TestWrapper({ children }: { children: React.ReactNode }) {
    return <MemoryRouter initialEntries={[initialUrl]}>{children}</MemoryRouter>;
  };
}

// Helper hook to observe URL search parameters simultaneously
function useSalesFiltersWithLocation() {
  const filters = useSalesFilters();
  const location = useLocation();
  return { ...filters, location };
}

describe('Sales URL-driven DataTable State Contract Tests', () => {
  describe('1. Default Parameter Mapping (Clean URL)', () => {
    it('initializes with deterministic defaults when URL is clean', () => {
      const { result } = renderHook(() => useSalesFilters(), {
        wrapper: createWrapper('/sales'),
      });

      expect(result.current.page).toBe(1);
      expect(result.current.limit).toBe(20);
      expect(result.current.q).toBe('');
      expect(result.current.sort).toBe('createdAt.desc');
      expect(result.current.sortState).toEqual([{ id: 'createdAt', desc: true }]);
      expect(result.current.filters).toEqual({});
      expect(result.current.isFiltered).toBe(false);

      // Verify the generated API query params object matches ListSalesQueryDto expectations
      expect(result.current.params).toEqual({
        page: 1,
        limit: 20,
        sort: 'createdAt.desc',
        sortField: 'createdAt',
        sortDirection: 'desc',
        q: undefined,
        search: undefined,
        clientId: undefined,
        status: undefined,
        sourceType: undefined,
        sourceReferenceId: undefined,
        fromDate: undefined,
        toDate: undefined,
      });
    });
  });

  describe('2. URL Hydration & Deep-Linking', () => {
    it('accurately hydrates all filters, sorting, and pagination from a populated URL', () => {
      const populatedUrl =
        '/sales?q=REG_01&clientId=cli_123&sourceType=FOOD&sourceReferenceId=terminal_9&status=PAID&fromDate=2026-10-01T00:00:00.000Z&toDate=2026-10-31T23:59:59.999Z&page=3&limit=50&sort=total.asc';

      const { result } = renderHook(() => useSalesFilters(), {
        wrapper: createWrapper(populatedUrl),
      });

      expect(result.current.q).toBe('REG_01');
      expect(result.current.page).toBe(3);
      expect(result.current.limit).toBe(50);
      expect(result.current.sort).toBe('total.asc');
      expect(result.current.sortState).toEqual([{ id: 'total', desc: false }]);
      expect(result.current.isFiltered).toBe(true);

      expect(result.current.filters).toEqual({
        clientId: 'cli_123',
        sourceType: 'FOOD',
        sourceReferenceId: 'terminal_9',
        status: 'PAID',
        fromDate: '2026-10-01T00:00:00.000Z',
        toDate: '2026-10-31T23:59:59.999Z',
      });

      expect(result.current.params).toEqual({
        q: 'REG_01',
        search: 'REG_01',
        clientId: 'cli_123',
        sourceType: 'FOOD',
        sourceReferenceId: 'terminal_9',
        status: 'PAID',
        fromDate: '2026-10-01T00:00:00.000Z',
        toDate: '2026-10-31T23:59:59.999Z',
        page: 3,
        limit: 50,
        sort: 'total.asc',
        sortField: 'total',
        sortDirection: 'asc',
      });
    });

    it('produces equivalent state on direct page open vs. navigation (refresh invariance)', () => {
      const deepLink = '/sales?status=COMPLETED&page=2&limit=20&sort=createdAt.desc';

      const firstRender = renderHook(() => useSalesFilters(), {
        wrapper: createWrapper(deepLink),
      });

      const secondRender = renderHook(() => useSalesFilters(), {
        wrapper: createWrapper(deepLink),
      });

      expect(firstRender.result.current.params).toEqual(secondRender.result.current.params);
    });
  });

  describe('3. Shareable URL State Synchronization & Actions', () => {
    it('synchronizes search changes to the URL and resets page to 1', () => {
      const { result } = renderHook(() => useSalesFiltersWithLocation(), {
        wrapper: createWrapper('/sales?page=4&limit=20'),
      });

      act(() => {
        result.current.setSearch('REGISTER_2');
      });

      expect(result.current.q).toBe('REGISTER_2');
      expect(result.current.page).toBe(1);
      expect(result.current.location.search).toContain('q=REGISTER_2');
      expect(result.current.location.search).not.toContain('page=4');
    });

    it('synchronizes status filter changes to the URL and resets page to 1', () => {
      const { result } = renderHook(() => useSalesFiltersWithLocation(), {
        wrapper: createWrapper('/sales?page=3'),
      });

      act(() => {
        result.current.setStatus('PENDING_PAYMENT');
      });

      expect(result.current.filters.status).toBe('PENDING_PAYMENT');
      expect(result.current.page).toBe(1);
      expect(result.current.location.search).toContain('status=PENDING_PAYMENT');
      expect(result.current.location.search).not.toContain('page=3');
    });

    it('clears status filter when set to ALL', () => {
      const { result } = renderHook(() => useSalesFiltersWithLocation(), {
        wrapper: createWrapper('/sales?status=DRAFT'),
      });

      act(() => {
        result.current.setStatus('ALL');
      });

      expect(result.current.filters.status).toBeUndefined();
      expect(result.current.location.search).not.toContain('status=');
    });

    it('synchronizes date range changes to the URL and resets page to 1', () => {
      const { result } = renderHook(() => useSalesFiltersWithLocation(), {
        wrapper: createWrapper('/sales?page=5'),
      });

      act(() => {
        result.current.setDateRange('2026-10-01T00:00:00.000Z', '2026-10-15T23:59:59.999Z');
      });

      expect(result.current.filters.fromDate).toBe('2026-10-01T00:00:00.000Z');
      expect(result.current.filters.toDate).toBe('2026-10-15T23:59:59.999Z');
      expect(result.current.page).toBe(1);
      expect(result.current.location.search).toContain('fromDate=2026-10-01T00%3A00%3A00.000Z');
      expect(result.current.location.search).toContain('toDate=2026-10-15T23%3A59%3A59.999Z');
    });

    it('synchronizes sort toggling (none -> asc -> desc -> none)', () => {
      const { result } = renderHook(() => useSalesFiltersWithLocation(), {
        wrapper: createWrapper('/sales'),
      });

      act(() => {
        result.current.toggleSort('total');
      });
      expect(result.current.location.search).toContain('sort=total.asc');

      act(() => {
        result.current.toggleSort('total');
      });
      expect(result.current.location.search).toContain('sort=total.desc');

      act(() => {
        result.current.toggleSort('total');
      });
      expect(result.current.location.search).not.toContain('sort=');
    });

    it('changing sort direction preserves the current page', () => {
      const { result } = renderHook(() => useSalesFiltersWithLocation(), {
        wrapper: createWrapper('/sales?page=3'),
      });

      act(() => {
        result.current.setSort('createdAt.asc');
      });

      expect(result.current.page).toBe(3);
      expect(result.current.location.search).toContain('page=3');
      expect(result.current.location.search).toContain('sort=createdAt.asc');
    });

    it('changing limit resets page to 1 and applies new limit', () => {
      const { result } = renderHook(() => useSalesFiltersWithLocation(), {
        wrapper: createWrapper('/sales?page=3&limit=20'),
      });

      act(() => {
        result.current.setLimit(50);
      });

      expect(result.current.page).toBe(1);
      expect(result.current.limit).toBe(50);
      expect(result.current.location.search).toContain('limit=50');
      expect(result.current.location.search).not.toContain('page=3');
    });

    it('resetFilters removes search and domain filters while preserving sort and limit', () => {
      const { result } = renderHook(() => useSalesFiltersWithLocation(), {
        wrapper: createWrapper('/sales?q=test&status=PAID&limit=50&sort=total.asc&page=2'),
      });

      act(() => {
        result.current.resetFilters();
      });

      expect(result.current.q).toBe('');
      expect(result.current.filters).toEqual({});
      expect(result.current.page).toBe(1);
      expect(result.current.limit).toBe(50);
      expect(result.current.sort).toBe('total.asc');
      expect(result.current.location.search).not.toContain('q=');
      expect(result.current.location.search).not.toContain('status=');
    });

    it('resetAll restores the entire URL state to initial configuration defaults', () => {
      const { result } = renderHook(() => useSalesFiltersWithLocation(), {
        wrapper: createWrapper('/sales?q=test&status=PAID&limit=50&sort=total.asc&page=2'),
      });

      act(() => {
        result.current.resetAll();
      });

      expect(result.current.q).toBe('');
      expect(result.current.filters).toEqual({});
      expect(result.current.page).toBe(1);
      expect(result.current.limit).toBe(20);
      expect(result.current.location.search).toBe('');
    });
  });

  describe('4. Resilient Fallbacks for Invalid or Malformed URL Parameters', () => {
    it('falls back to default page 1 when page is non-numeric, 0, or negative', () => {
      const { result } = renderHook(() => useSalesFilters(), {
        wrapper: createWrapper('/sales?page=abc'),
      });
      expect(result.current.page).toBe(1);

      const negativeRender = renderHook(() => useSalesFilters(), {
        wrapper: createWrapper('/sales?page=-5'),
      });
      expect(negativeRender.result.current.page).toBe(1);
    });

    it('falls back to default limit 20 when limit is invalid or unallowed', () => {
      const { result } = renderHook(() => useSalesFilters(), {
        wrapper: createWrapper('/sales?limit=999'),
      });
      expect(result.current.limit).toBe(20);

      const invalidLimitRender = renderHook(() => useSalesFilters(), {
        wrapper: createWrapper('/sales?limit=xyz'),
      });
      expect(invalidLimitRender.result.current.limit).toBe(20);
    });

    it('filters out unsupported or malformed sale status values', () => {
      const { result } = renderHook(() => useSalesFilters(), {
        wrapper: createWrapper('/sales?status=TOTALLY_INVALID_STATUS'),
      });
      expect(result.current.filters.status).toBeUndefined();
    });

    it('normalizes lowercase valid status to uppercase enum', () => {
      const { result } = renderHook(() => useSalesFilters(), {
        wrapper: createWrapper('/sales?status=paid'),
      });
      expect(result.current.filters.status).toBe('PAID' as SaleStatus);
    });

    it('ignores malformed compound sort string gracefully', () => {
      const { result } = renderHook(() => useSalesFilters(), {
        wrapper: createWrapper('/sales?sort=invalid.sort.with.too.many.dots'),
      });
      // Should fall back to default sort without throwing
      expect(result.current.sortState).toEqual([{ id: 'createdAt', desc: true }]);
    });
  });
});
