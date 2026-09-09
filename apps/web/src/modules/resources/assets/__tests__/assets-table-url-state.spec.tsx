import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AssetsListPage } from '../routes/assets-list-page';
import { AssetMaintenancePage } from '../routes/asset-maintenance-page';
import { AssetHistoryPage } from '../routes/asset-history-page';
import * as authProvider from '../../../../app/providers/auth-provider';
import * as assetQueries from '../hooks/use-assets-queries';
import {
  AssetCategory,
  AssetStatus,
  AssetCondition,
  AssetHistoryEventType,
  type FixedAssetVM,
  type PaginatedFixedAssetsVM,
  type PaginatedMaintenanceVM,
  type PaginatedAssetHistoryVM,
  type AssetMaintenanceRecordVM,
  type AssetHistoryEventVM,
} from '../types';

jest.mock('../../../../app/providers/auth-provider', () => {
  const actual = jest.requireActual('../../../../app/providers/auth-provider');
  return {
    ...actual,
    useAuth: jest.fn(),
  };
});

jest.mock('../hooks/use-assets-queries', () => ({
  useAssetsList: jest.fn(),
  useAsset: jest.fn(),
  useAssetValuationSummary: jest.fn(),
  useAssetMaintenanceHistory: jest.fn(),
  useAssetHistory: jest.fn(),
}));

jest.mock('../hooks/use-assets-mutations', () => ({
  useCreateAsset: jest.fn(() => ({ mutate: jest.fn(), isPending: false })),
  useUpdateAssetDetails: jest.fn(() => ({ mutate: jest.fn(), isPending: false })),
  useTransferAssetLocation: jest.fn(() => ({ mutate: jest.fn(), isPending: false })),
  useChangeAssetStatus: jest.fn(() => ({ mutate: jest.fn(), isPending: false })),
  useUpdateAssetCondition: jest.fn(() => ({ mutate: jest.fn(), isPending: false })),
  useRecordAssetMaintenance: jest.fn(() => ({ mutate: jest.fn(), isPending: false })),
  useUpdateAssetValuation: jest.fn(() => ({ mutate: jest.fn(), isPending: false })),
}));

// Helper component tracking location search in tests
const LocationTracker: React.FC = () => {
  const location = useLocation();
  return <div data-testid="location-search">{location.search}</div>;
};

const MOCK_ASSET: FixedAssetVM = {
  id: 'ast-cardio-1',
  assetTag: 'AST-GYM-001',
  name: 'Treadmill Commercial T80',
  description: 'High performance cardio treadmill',
  category: AssetCategory.GYM_EQUIPMENT,
  status: AssetStatus.ACTIVE,
  condition: AssetCondition.EXCELLENT,
  purchaseDate: '2025-01-10T00:00:00Z',
  purchaseValueAmount: 4500.0,
  purchaseValueCurrency: 'USD',
  currentEstimatedValueAmount: 4200.0,
  currentEstimatedValueCurrency: 'USD',
  location: {
    facilityId: 'fac-main',
    roomId: 'room-cardio-1',
    zone: 'Zone A',
  },
  version: 1,
  createdAt: '2025-01-10T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
};

const MOCK_PAGINATED_ASSETS: PaginatedFixedAssetsVM = {
  items: [MOCK_ASSET],
  total: 1,
  page: 1,
  limit: 10,
  totalPages: 1,
  hasNextPage: false,
  hasPreviousPage: false,
};

const MOCK_MAINTENANCE_RECORD: AssetMaintenanceRecordVM = {
  id: 'maint-1',
  assetId: 'ast-cardio-1',
  serviceDate: '2026-06-01T10:00:00Z',
  performedBy: 'Technician John Doe',
  cost: { amount: 350, currency: 'USD' },
  description: 'Replaced motor drive belt and lubricated deck',
  notes: 'Quarterly preventative service completed.',
  recordedByUserId: 'usr-admin-1',
  createdAt: '2026-06-01T11:00:00Z',
};

const MOCK_PAGINATED_MAINTENANCE: PaginatedMaintenanceVM = {
  items: [MOCK_MAINTENANCE_RECORD],
  total: 1,
  page: 1,
  limit: 10,
  totalPages: 1,
  hasNextPage: false,
  hasPreviousPage: false,
};

const MOCK_HISTORY_RECORD: AssetHistoryEventVM = {
  id: 'hist-1',
  assetId: 'ast-cardio-1',
  eventType: AssetHistoryEventType.STATUS_CHANGED,
  description: 'Asset status transitioned to ACTIVE',
  details: {
    statusFrom: AssetStatus.UNDER_MAINTENANCE,
    statusTo: AssetStatus.ACTIVE,
  },
  recordedByUserId: 'admin-jane',
  recordedAt: '2026-08-01T12:00:00Z',
};

const MOCK_PAGINATED_HISTORY: PaginatedAssetHistoryVM = {
  items: [MOCK_HISTORY_RECORD],
  total: 1,
  page: 1,
  limit: 15,
  totalPages: 1,
  hasNextPage: false,
  hasPreviousPage: false,
};

describe('Phase 6 Fixed Assets URL-driven DataTable Standards', () => {
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
        permissions: ['assets.read', 'assets.write', 'billing.read', 'valuation.read'],
      },
      hasPermission: () => true,
      hasRole: () => true,
    });

    (assetQueries.useAssetsList as jest.Mock).mockReturnValue({
      data: MOCK_PAGINATED_ASSETS,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    (assetQueries.useAsset as jest.Mock).mockReturnValue({
      data: MOCK_ASSET,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    (assetQueries.useAssetMaintenanceHistory as jest.Mock).mockReturnValue({
      data: MOCK_PAGINATED_MAINTENANCE,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    (assetQueries.useAssetHistory as jest.Mock).mockReturnValue({
      data: MOCK_PAGINATED_HISTORY,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('1. Asset List Page URL State Integration', () => {
    const renderAssetsList = (initialUrl = '/resources/assets') => {
      return render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[initialUrl]}>
            <LocationTracker />
            <Routes>
              <Route path="/resources/assets" element={<AssetsListPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );
    };

    it('hydrates filter params from complex URL and passes to useAssetsList query', () => {
      const complexUrl =
        '/resources/assets?search=Treadmill&category=GYM_EQUIPMENT&status=ACTIVE&condition=EXCELLENT&page=2&limit=20&sort=name.desc&includeDecommissioned=true';
      renderAssetsList(complexUrl);

      expect(assetQueries.useAssetsList).toHaveBeenCalledWith(
        expect.objectContaining({
          search: 'Treadmill',
          category: AssetCategory.GYM_EQUIPMENT,
          status: AssetStatus.ACTIVE,
          condition: AssetCondition.EXCELLENT,
          page: 2,
          limit: 20,
          sortBy: 'name',
          sortOrder: 'desc',
          includeDecommissioned: true,
        }),
      );
    });

    it('debounces search input updates to URL and resets page to 1', async () => {
      renderAssetsList('/resources/assets?page=3');

      const searchInput = screen.getByPlaceholderText(/search by asset tag/i);
      fireEvent.change(searchInput, { target: { value: 'Elliptical' } });

      await waitFor(() => {
        const tracker = screen.getByTestId('location-search');
        expect(tracker.textContent).toContain('search=Elliptical');
        // page reset when search query changes
        expect(tracker.textContent).not.toContain('page=3');
      });
    });

    it('differentiates unfiltered empty state from filtered empty state', () => {
      // 1. Unfiltered empty state
      (assetQueries.useAssetsList as jest.Mock).mockReturnValue({
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

      const { unmount } = renderAssetsList('/resources/assets');
      expect(screen.getByText('No assets exist')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /commission first asset/i })).toBeInTheDocument();
      unmount();

      // 2. Filtered empty state
      renderAssetsList('/resources/assets?search=NonExistentDevice');
      expect(screen.getByText('No assets match your search/filter.')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /commission first asset/i }),
      ).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /reset filters/i })).toBeInTheDocument();
    });

    it('clears all filters when reset button is clicked', () => {
      (assetQueries.useAssetsList as jest.Mock).mockReturnValue({
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

      renderAssetsList('/resources/assets?search=Unknown&category=GYM_EQUIPMENT&page=2');
      const resetBtn = screen.getByRole('button', { name: /reset filters/i });
      fireEvent.click(resetBtn);

      const tracker = screen.getByTestId('location-search');
      expect(tracker.textContent).toBe('');
    });
  });

  describe('2. Asset Maintenance Page URL State Integration', () => {
    const renderMaintenancePage = (initialUrl = '/resources/assets/ast-cardio-1/maintenance') => {
      return render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[initialUrl]}>
            <LocationTracker />
            <Routes>
              <Route path="/resources/assets/:id/maintenance" element={<AssetMaintenancePage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );
    };

    it('hydrates technician search and pagination from URL into useAssetMaintenanceHistory', () => {
      renderMaintenancePage(
        '/resources/assets/ast-cardio-1/maintenance?performedBy=Technician%20Smith&page=2&limit=20',
      );

      expect(assetQueries.useAssetMaintenanceHistory).toHaveBeenCalledWith(
        'ast-cardio-1',
        expect.objectContaining({
          performedBy: 'Technician Smith',
          page: 2,
          limit: 20,
        }),
      );
    });

    it('debounces technician search input and synchronizes URL query param', async () => {
      renderMaintenancePage('/resources/assets/ast-cardio-1/maintenance');

      const input = screen.getByTestId('filter-technician-input');
      fireEvent.change(input, { target: { value: 'Tech Miller' } });

      await waitFor(() => {
        const tracker = screen.getByTestId('location-search');
        expect(tracker.textContent).toContain('performedBy=Tech+Miller');
      });
    });

    it('differentiates unfiltered empty state from filtered maintenance empty state', () => {
      // 1. Unfiltered empty
      (assetQueries.useAssetMaintenanceHistory as jest.Mock).mockReturnValue({
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

      const { unmount } = renderMaintenancePage('/resources/assets/ast-cardio-1/maintenance');
      expect(screen.getByText('No servicing work orders logged')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /log first maintenance order/i }),
      ).toBeInTheDocument();
      unmount();

      // 2. Filtered empty
      renderMaintenancePage(
        '/resources/assets/ast-cardio-1/maintenance?performedBy=UnknownTechnician',
      );
      expect(
        screen.getByText('No servicing work orders match your search/filter.'),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /log first maintenance order/i }),
      ).not.toBeInTheDocument();
      expect(screen.getByTestId('reset-maintenance-filter-btn')).toBeInTheDocument();
    });

    it('clears technician filter when Clear Filters is clicked', () => {
      (assetQueries.useAssetMaintenanceHistory as jest.Mock).mockReturnValue({
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

      renderMaintenancePage(
        '/resources/assets/ast-cardio-1/maintenance?performedBy=UnknownTechnician',
      );
      const clearBtn = screen.getByTestId('reset-maintenance-filter-btn');
      fireEvent.click(clearBtn);

      const tracker = screen.getByTestId('location-search');
      expect(tracker.textContent).toBe('');
    });
  });

  describe('3. Asset History Page URL State Integration', () => {
    const renderHistoryPage = (initialUrl = '/resources/assets/ast-cardio-1/history') => {
      return render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[initialUrl]}>
            <LocationTracker />
            <Routes>
              <Route path="/resources/assets/:id/history" element={<AssetHistoryPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );
    };

    it('hydrates eventType filter, sorting, and pagination from URL into useAssetHistory', () => {
      renderHistoryPage(
        '/resources/assets/ast-cardio-1/history?eventType=STATUS_CHANGED&sort=timestamp.asc&page=3&limit=30',
      );

      expect(assetQueries.useAssetHistory).toHaveBeenCalledWith(
        'ast-cardio-1',
        expect.objectContaining({
          eventType: AssetHistoryEventType.STATUS_CHANGED,
          sortOrder: 'asc',
          page: 3,
          limit: 30,
        }),
      );
    });

    it('differentiates unfiltered empty state from filtered history empty state', () => {
      // 1. Unfiltered empty
      (assetQueries.useAssetHistory as jest.Mock).mockReturnValue({
        data: {
          items: [],
          total: 0,
          page: 1,
          limit: 15,
          totalPages: 0,
          hasNextPage: false,
          hasPreviousPage: false,
        },
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });

      const { unmount } = renderHistoryPage('/resources/assets/ast-cardio-1/history');
      expect(screen.getByText('No lifecycle events recorded')).toBeInTheDocument();
      unmount();

      // 2. Filtered empty
      renderHistoryPage('/resources/assets/ast-cardio-1/history?eventType=RETIRED');
      expect(
        screen.getByText('No lifecycle events match your filter criteria.'),
      ).toBeInTheDocument();
      expect(screen.getByTestId('clear-event-filter-btn')).toBeInTheDocument();
    });

    it('clears event type filter when Clear Event Filter button is clicked', () => {
      (assetQueries.useAssetHistory as jest.Mock).mockReturnValue({
        data: {
          items: [],
          total: 0,
          page: 1,
          limit: 15,
          totalPages: 0,
          hasNextPage: false,
          hasPreviousPage: false,
        },
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });

      renderHistoryPage('/resources/assets/ast-cardio-1/history?eventType=RETIRED');
      const clearBtn = screen.getByTestId('clear-event-filter-btn');
      fireEvent.click(clearBtn);

      const tracker = screen.getByTestId('location-search');
      expect(tracker.textContent).not.toContain('eventType=RETIRED');
    });
  });
});
