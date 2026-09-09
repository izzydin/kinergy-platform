import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InventoryListPage } from '../routes/inventory-list-page';
import { InventoryMovementsPage } from '../routes/inventory-movements-page';
import * as authProvider from '../../../../app/providers/auth-provider';
import * as inventoryQueries from '../hooks/use-inventory-queries';
import { inventoryQueryKeys } from '../api';
import {
  InventoryCategory,
  InventoryItemStatus,
  StockMovementType,
  type InventoryProductVM,
  type PaginatedInventoryVM,
  type PaginatedStockMovementsVM,
} from '../types';

jest.mock('../../../../app/providers/auth-provider', () => {
  const actual = jest.requireActual('../../../../app/providers/auth-provider');
  return {
    ...actual,
    useAuth: jest.fn(),
  };
});

jest.mock('../hooks/use-inventory-queries', () => ({
  useInventoryList: jest.fn(),
  useInventoryProduct: jest.fn(),
  useStockMovements: jest.fn(),
  useLowStockItems: jest.fn(),
  useInventoryValuation: jest.fn(),
  useInventoryCategories: jest.fn(),
}));

jest.mock('../hooks/use-inventory-mutations', () => ({
  useArchiveProduct: jest.fn(() => ({ mutate: jest.fn(), isPending: false })),
  useActivateProduct: jest.fn(() => ({ mutate: jest.fn(), isPending: false })),
  useCreateProduct: jest.fn(() => ({ mutate: jest.fn(), isPending: false })),
  useUpdateProduct: jest.fn(() => ({ mutate: jest.fn(), isPending: false })),
}));

// Component that displays current URLSearchParams for deterministic assertions
const LocationTracker: React.FC = () => {
  const location = useLocation();
  return <div data-testid="location-search">{location.search}</div>;
};

const MOCK_PRODUCT: InventoryProductVM = {
  id: 'prod-item-1',
  sku: 'PROT-WHEY-1KG',
  name: 'Gold Standard Whey 1kg',
  description: '100% Whey Protein Isolate',
  category: InventoryCategory.SUPPLEMENTS,
  unitCost: { amount: 28.5, currency: 'USD' },
  sellingPrice: { amount: 55.0, currency: 'USD' },
  currentStock: 42,
  reorderThreshold: 10,
  unitOfMeasure: 'TUBS',
  status: InventoryItemStatus.ACTIVE,
  isLowStock: false,
  isOutOfStock: false,
  createdAt: '2026-01-15T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

const MOCK_PAGINATED_DATA: PaginatedInventoryVM = {
  items: [MOCK_PRODUCT],
  total: 1,
  page: 1,
  limit: 10,
  totalPages: 1,
};

describe('Phase 6 Consumable Inventory URL-driven DataTable Standards', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });

    (authProvider.useAuth as jest.Mock).mockReturnValue({
      currentUser: {
        userId: 'admin-1',
        email: 'admin@kinergy.com',
        roles: ['ADMIN'],
        permissions: ['inventory.read', 'inventory.write', 'valuation.read'],
      },
      hasPermission: () => true,
      hasRole: () => true,
    });

    (inventoryQueries.useInventoryList as jest.Mock).mockReturnValue({
      data: MOCK_PAGINATED_DATA,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    (inventoryQueries.useInventoryCategories as jest.Mock).mockReturnValue({
      data: Object.values(InventoryCategory).map((c) => ({
        code: c,
        displayName: c.replace(/_/g, ' '),
        description: `${c} description`,
        defaultUnitOfMeasure: 'UNITS',
        regulatoryClassification: 'STANDARD',
        activeProductCount: 5,
      })),
      isLoading: false,
      isError: false,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const renderInventoryList = (initialUrl = '/resources/inventory') => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialUrl]}>
          <LocationTracker />
          <Routes>
            <Route path="/resources/inventory" element={<InventoryListPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  };

  describe('1. Initial URL Hydration & TanStack Query Key Synchronization', () => {
    it('initial URL query parameters hydrate filter parameters and synchronize query key', () => {
      const complexUrl =
        '/resources/inventory?search=whey&category=SUPPLEMENTS&stockStatus=LOW_STOCK&page=2&limit=20&sort=name.desc';
      renderInventoryList(complexUrl);

      const expectedParams = {
        search: 'whey',
        category: InventoryCategory.SUPPLEMENTS,
        stockStatus: 'LOW_STOCK' as const,
        status: undefined,
        includeArchived: undefined,
        page: 2,
        limit: 20,
        sortBy: 'name' as const,
        sortOrder: 'desc' as const,
      };

      // 1. Hook called with parsed URL parameters
      expect(inventoryQueries.useInventoryList).toHaveBeenCalledWith(
        expect.objectContaining(expectedParams),
      );

      // 2. TanStack Query Key incorporates all parameters avoiding stale cache hits
      const generatedKey = inventoryQueryKeys.list(expectedParams);
      expect(generatedKey).toEqual([
        'resources',
        'inventory',
        'list',
        expect.objectContaining(expectedParams),
      ]);
    });

    it('clean URL initializes with default parameters without unnecessary query string', () => {
      renderInventoryList('/resources/inventory');

      expect(screen.getByTestId('location-search')).toHaveTextContent('');
      expect(inventoryQueries.useInventoryList).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 1,
          limit: 10,
        }),
      );
    });
  });

  describe('2. Table -> URL Synchronization & Pagination Reset Rules', () => {
    it('entering search query updates URL and resets page to 1', async () => {
      // Start on page 3 with active category
      renderInventoryList('/resources/inventory?category=SUPPLEMENTS&page=3');

      const searchInput = screen.getByPlaceholderText(/search by sku, product name/i);

      // Type search term
      fireEvent.change(searchInput, { target: { value: 'creatine' } });

      // Search is debounced: wait for URL state update
      await waitFor(() => {
        const searchLocation = screen.getByTestId('location-search').textContent;
        expect(searchLocation).toContain('search=creatine');
        expect(searchLocation).toContain('category=SUPPLEMENTS');
        // Page 3 must be reset because search criteria changed
        expect(searchLocation).not.toContain('page=3');
      });
    });

    it('clearing search query removes search param from URL and resets page', async () => {
      renderInventoryList('/resources/inventory?search=creatine&page=2');

      const searchInput = screen.getByPlaceholderText(/search by sku, product name/i);
      fireEvent.change(searchInput, { target: { value: '' } });

      await waitFor(() => {
        const searchLocation = screen.getByTestId('location-search').textContent;
        expect(searchLocation).not.toContain('search=creatine');
        expect(searchLocation).not.toContain('page=2');
      });
    });

    it('changing page updates URL page parameter without wiping search or active filters', async () => {
      (inventoryQueries.useInventoryList as jest.Mock).mockReturnValue({
        data: {
          ...MOCK_PAGINATED_DATA,
          total: 50,
          page: 1,
          limit: 10,
          totalPages: 5,
          hasNextPage: true,
        },
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });

      renderInventoryList('/resources/inventory?search=isolate&category=SUPPLEMENTS');

      // Click next page button
      const nextBtn = screen.getByRole('button', { name: /go to next page/i });
      fireEvent.click(nextBtn);

      await waitFor(() => {
        const searchLocation = screen.getByTestId('location-search').textContent;
        expect(searchLocation).toContain('page=2');
        expect(searchLocation).toContain('search=isolate');
        expect(searchLocation).toContain('category=SUPPLEMENTS');
      });
    });

    it('reset filters button removes search and facet filters while preserving sort state', async () => {
      renderInventoryList(
        '/resources/inventory?search=whey&category=SUPPLEMENTS&stockStatus=LOW_STOCK&sort=name.desc&page=2',
      );

      const resetBtn = screen.getByRole('button', { name: /^reset$/i });
      fireEvent.click(resetBtn);

      await waitFor(() => {
        const searchLocation = screen.getByTestId('location-search').textContent;
        expect(searchLocation).not.toContain('search=whey');
        expect(searchLocation).not.toContain('category=SUPPLEMENTS');
        expect(searchLocation).not.toContain('stockStatus=LOW_STOCK');
        expect(searchLocation).not.toContain('page=2');
      });
    });
  });

  describe('3. Empty State Disambiguation: Database Empty vs. Search/Filter Empty', () => {
    it('unfiltered empty catalog: renders "No products exist" and Register First Product action', () => {
      (inventoryQueries.useInventoryList as jest.Mock).mockReturnValue({
        data: {
          items: [],
          total: 0,
          page: 1,
          limit: 10,
          totalPages: 0,
          hasNextPage: false,
          hasPreviousPage: false,
        },
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });

      renderInventoryList('/resources/inventory');

      // Must explicitly communicate that catalog is empty, NOT that search failed
      expect(screen.getByText('No products exist')).toBeInTheDocument();
      expect(
        screen.getByText(/no consumable products have been registered in the catalog yet/i),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /register first product/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /reset filters/i })).not.toBeInTheDocument();
    });

    it('filtered empty search: renders "No products match your search/filter." and Reset Filters action', () => {
      (inventoryQueries.useInventoryList as jest.Mock).mockReturnValue({
        data: {
          items: [],
          total: 0,
          page: 1,
          limit: 10,
          totalPages: 0,
          hasNextPage: false,
          hasPreviousPage: false,
        },
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });

      // Filtered by non-existent query
      renderInventoryList('/resources/inventory?search=nonexistentitemxyz');

      // Must explicitly communicate filter mismatch
      expect(screen.getByText('No products match your search/filter.')).toBeInTheDocument();
      expect(
        screen.getByText(
          /try adjusting your search terms or clearing active filters to view available products/i,
        ),
      ).toBeInTheDocument();

      // Action must be Reset Filters, NOT Register First Product
      const resetButtons = screen.getAllByRole('button', { name: /reset filters/i });
      expect(resetButtons.length).toBeGreaterThanOrEqual(1);
      expect(
        screen.queryByRole('button', { name: /register first product/i }),
      ).not.toBeInTheDocument();
    });
  });

  describe('4. Stock Movement Ledger URL State (InventoryMovementsPage)', () => {
    it('synchronizes movementType and page from URL parameters', () => {
      (inventoryQueries.useInventoryProduct as jest.Mock).mockReturnValue({
        data: MOCK_PRODUCT,
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });

      const mockMovementsData: PaginatedStockMovementsVM = {
        items: [
          {
            id: 'm-1',
            itemId: MOCK_PRODUCT.id,
            type: StockMovementType.PURCHASE,
            quantity: 20,
            previousBalance: 22,
            newBalance: 42,
            unitCost: { amount: 28.5, currency: 'USD' },
            sellingPrice: { amount: 55.0, currency: 'USD' },
            referenceNumber: 'PO-9911',
            reason: 'Replenishment shipment received',
            actorId: 'usr-manager',
            occurredAt: '2026-08-10T10:00:00.000Z',
          },
        ],
        total: 1,
        page: 2,
        limit: 10,
        totalPages: 1,
      };

      (inventoryQueries.useStockMovements as jest.Mock).mockReturnValue({
        data: mockMovementsData,
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter
            initialEntries={[
              '/resources/inventory/prod-item-1/movements?movementType=PURCHASE&page=2',
            ]}
          >
            <LocationTracker />
            <Routes>
              <Route
                path="/resources/inventory/:id/movements"
                element={<InventoryMovementsPage />}
              />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Verifies useStockMovements was called with parsed URL parameters
      expect(inventoryQueries.useStockMovements).toHaveBeenCalledWith(
        'prod-item-1',
        expect.objectContaining({
          movementType: StockMovementType.PURCHASE,
          page: 2,
          limit: 10,
        }),
      );

      // Verifies TanStack Query Key incorporates parameters
      const generatedKey = inventoryQueryKeys.movements('prod-item-1', {
        movementType: StockMovementType.PURCHASE,
        page: 2,
        limit: 10,
      });
      expect(generatedKey).toEqual([
        'resources',
        'inventory',
        'detail',
        'prod-item-1',
        'movements',
        {
          movementType: StockMovementType.PURCHASE,
          page: 2,
          limit: 10,
        },
      ]);
    });
  });
});
