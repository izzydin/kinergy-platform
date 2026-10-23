import '@testing-library/jest-dom';
import { act, renderHook } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { useClientFilters } from '../use-client-filters';

function createWrapper(initialUrl = '/clients') {
  return function TestWrapper({ children }: { children: React.ReactNode }) {
    return <MemoryRouter initialEntries={[initialUrl]}>{children}</MemoryRouter>;
  };
}

function useClientFiltersWithLocation() {
  const filters = useClientFilters();
  const location = useLocation();
  return { ...filters, location };
}

describe('useClientFilters URL-driven DataTable State Contract Tests', () => {
  describe('1. Default Parameter Mapping (Clean URL)', () => {
    it('initializes with deterministic defaults when URL is clean', () => {
      const { result } = renderHook(() => useClientFilters(), {
        wrapper: createWrapper('/clients'),
      });

      expect(result.current.page).toBe(1);
      expect(result.current.limit).toBe(10);
      expect(result.current.q).toBe('');
      expect(result.current.sort).toBe('createdAt.desc');
      expect(result.current.sortField).toBe('createdAt');
      expect(result.current.sortDirection).toBe('desc');
      expect(result.current.sortState).toEqual([{ id: 'createdAt', desc: true }]);
      expect(result.current.filters).toEqual({});
      expect(result.current.isFiltered).toBe(false);

      expect(result.current.params).toEqual({
        page: 1,
        limit: 10,
        sort: 'createdAt.desc',
        sortBy: 'createdAt',
        sortOrder: 'DESC',
        q: undefined,
        query: undefined,
        status: undefined,
        includeArchived: undefined,
        createdFrom: undefined,
        createdTo: undefined,
      });
    });
  });

  describe('2. URL Hydration & Deep-Linking', () => {
    it('accurately hydrates all filters, sorting, and pagination from a populated URL', () => {
      const populatedUrl =
        '/clients?q=Carlos&status=ACTIVE&includeArchived=true&createdFrom=2026-01-01&createdTo=2026-12-31&page=3&limit=50&sort=name.asc';

      const { result } = renderHook(() => useClientFilters(), {
        wrapper: createWrapper(populatedUrl),
      });

      expect(result.current.page).toBe(3);
      expect(result.current.limit).toBe(50);
      expect(result.current.q).toBe('Carlos');
      expect(result.current.sort).toBe('name.asc');
      expect(result.current.sortField).toBe('name');
      expect(result.current.sortDirection).toBe('asc');
      expect(result.current.sortState).toEqual([{ id: 'name', desc: false }]);
      expect(result.current.filters.status).toBe('ACTIVE');
      expect(result.current.filters.includeArchived).toBe(true);
      expect(result.current.filters.createdFrom).toBe('2026-01-01');
      expect(result.current.filters.createdTo).toBe('2026-12-31');
      expect(result.current.isFiltered).toBe(true);

      expect(result.current.params).toEqual({
        page: 3,
        limit: 50,
        sort: 'name.asc',
        sortBy: 'name',
        sortOrder: 'ASC',
        q: 'Carlos',
        query: 'Carlos',
        status: 'ACTIVE',
        includeArchived: true,
        createdFrom: '2026-01-01',
        createdTo: '2026-12-31',
      });
    });

    it('sanitizes invalid status or limit values to safe defaults', () => {
      const malformedUrl = '/clients?status=INVALID_STATUS&limit=9999&page=-5';

      const { result } = renderHook(() => useClientFilters(), {
        wrapper: createWrapper(malformedUrl),
      });

      expect(result.current.page).toBe(1);
      expect(result.current.limit).toBe(10);
      expect(result.current.filters.status).toBeUndefined();
    });
  });

  describe('3. Filter & Search Mutations with Page Resets', () => {
    it('updates search query and resets page to 1', () => {
      const { result } = renderHook(() => useClientFiltersWithLocation(), {
        wrapper: createWrapper('/clients?page=5'),
      });

      expect(result.current.page).toBe(5);

      act(() => {
        result.current.setSearch('Alice');
      });

      expect(result.current.q).toBe('Alice');
      expect(result.current.page).toBe(1);
      expect(result.current.location.search).toContain('q=Alice');
      expect(result.current.location.search).not.toContain('page=5');
    });

    it('updates status filter and resets page to 1', () => {
      const { result } = renderHook(() => useClientFiltersWithLocation(), {
        wrapper: createWrapper('/clients?page=3'),
      });

      act(() => {
        result.current.setStatus('ARCHIVED');
      });

      expect(result.current.filters.status).toBe('ARCHIVED');
      expect(result.current.page).toBe(1);
      expect(result.current.location.search).toContain('status=ARCHIVED');
    });

    it('updates includeArchived filter and resets page to 1', () => {
      const { result } = renderHook(() => useClientFiltersWithLocation(), {
        wrapper: createWrapper('/clients?page=4'),
      });

      act(() => {
        result.current.setIncludeArchived(true);
      });

      expect(result.current.filters.includeArchived).toBe(true);
      expect(result.current.page).toBe(1);
      expect(result.current.location.search).toContain('includeArchived=true');
    });

    it('updates date range filters', () => {
      const { result } = renderHook(() => useClientFiltersWithLocation(), {
        wrapper: createWrapper('/clients'),
      });

      act(() => {
        result.current.setDateRange('2026-06-01', '2026-06-30');
      });

      expect(result.current.filters.createdFrom).toBe('2026-06-01');
      expect(result.current.filters.createdTo).toBe('2026-06-30');
      expect(result.current.location.search).toContain('createdFrom=2026-06-01');
      expect(result.current.location.search).toContain('createdTo=2026-06-30');
    });

    it('adapts TanStack table sorting changes via handleSortingChange', () => {
      const { result } = renderHook(() => useClientFiltersWithLocation(), {
        wrapper: createWrapper('/clients'),
      });

      act(() => {
        result.current.handleSortingChange([{ id: 'updatedAt', desc: false }]);
      });

      expect(result.current.sort).toBe('updatedAt.asc');
      expect(result.current.sortField).toBe('updatedAt');
      expect(result.current.sortDirection).toBe('asc');
      expect(result.current.location.search).toContain('sort=updatedAt.asc');

      // Empty sorting array restores default createdAt.desc
      act(() => {
        result.current.handleSortingChange([]);
      });

      expect(result.current.sort).toBe('createdAt.desc');
      expect(result.current.sortField).toBe('createdAt');
      expect(result.current.sortDirection).toBe('desc');
    });

    it('resets all active search and filter facets while preserving page size and sort', () => {
      const populatedUrl =
        '/clients?q=Carlos&status=ACTIVE&includeArchived=true&page=3&limit=50&sort=name.asc';

      const { result } = renderHook(() => useClientFiltersWithLocation(), {
        wrapper: createWrapper(populatedUrl),
      });

      expect(result.current.isFiltered).toBe(true);

      act(() => {
        result.current.resetFilters();
      });

      expect(result.current.q).toBe('');
      expect(result.current.filters.status).toBeUndefined();
      expect(result.current.filters.includeArchived).toBeUndefined();
      expect(result.current.page).toBe(1);
      expect(result.current.limit).toBe(50); // Preserved
      expect(result.current.sort).toBe('name.asc'); // Preserved
      expect(result.current.isFiltered).toBe(false);
    });
  });
});
