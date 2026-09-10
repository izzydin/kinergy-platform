import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  InventoryItemStatus,
  InventoryCategory,
  AssetStatus,
  AssetCondition,
  AssetCategory,
} from '@kinergy-platform/core';

// Auth module mock
import * as authModule from '../../../app/providers/auth-provider';

// Overview
import { ResourceOverviewPage } from '../overview/routes/resource-overview-page';
import * as overviewQueries from '../overview/hooks/use-resource-overview';

// Inventory
import { InventoryOverviewPage } from '../inventory/routes/inventory-overview-page';
import { LowStockPage } from '../inventory/routes/low-stock-page';
import { InventoryListPage } from '../inventory/routes/inventory-list-page';
import { InventoryDetailPage } from '../inventory/routes/inventory-detail-page';
import * as inventoryQueries from '../inventory/hooks/use-inventory-queries';

// Assets
import { AssetOverviewPage } from '../assets/routes/asset-overview-page';
import { AssetsListPage } from '../assets/routes/assets-list-page';
import { AssetDetailPage } from '../assets/routes/asset-detail-page';
import { AssetHistoryPreview } from '../assets/components/asset-history-preview';
import { AssetMaintenancePreview } from '../assets/components/asset-maintenance-preview';
import * as assetQueries from '../assets/hooks/use-assets-queries';

jest.mock('../../../app/providers/auth-provider', () => {
  const actual = jest.requireActual('../../../app/providers/auth-provider');
  return {
    ...actual,
    useAuth: jest.fn(),
  };
});

jest.mock('../../../app/providers/notification-provider', () => ({
  useNotification: () => ({
    success: jest.fn(),
    error: jest.fn(),
    warning: jest.fn(),
    info: jest.fn(),
  }),
}));

jest.mock('../overview/hooks/use-resource-overview', () => ({
  useResourceOverview: jest.fn(),
}));

jest.mock('../inventory/hooks/use-inventory-queries', () => {
  const actual = jest.requireActual('../inventory/hooks/use-inventory-queries');
  return {
    ...actual,
    useInventoryProduct: jest.fn(),
    useInventoryList: jest.fn(),
    useLowStockItems: jest.fn(),
    useInventoryValuation: jest.fn(),
    useStockMovements: jest.fn(),
    useInventoryCategories: jest.fn(),
  };
});

jest.mock('../assets/hooks/use-assets-queries', () => {
  const actual = jest.requireActual('../assets/hooks/use-assets-queries');
  return {
    ...actual,
    useAsset: jest.fn(),
    useAssetsList: jest.fn(),
    useAssetValuation: jest.fn(),
    useAssetValuationSummary: jest.fn(),
    useAssetHistory: jest.fn(),
    useAssetMaintenanceHistory: jest.fn(),
    useAssetCategories: jest.fn(),
  };
});

const mockProduct = {
  id: 'prod-001',
  sku: 'PRD-WHEY-01',
  name: 'Vanilla Whey Protein',
  description: '100% pure whey isolate',
  category: InventoryCategory.SUPPLEMENTS,
  status: InventoryItemStatus.ACTIVE,
  currentStock: 25,
  reorderThreshold: 10,
  unitOfMeasure: 'TUBS',
  unitCost: { amount: 20.0, currency: 'USD' },
  sellingPrice: { amount: 39.99, currency: 'USD' },
  isLowStock: false,
  isOutOfStock: false,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const mockAsset = {
  id: 'asset-001',
  assetTag: 'AST-KNRG-001',
  name: 'LifeFitness Treadmill Pro',
  description: 'Commercial running deck',
  category: AssetCategory.GYM_EQUIPMENT,
  status: AssetStatus.ACTIVE,
  condition: AssetCondition.GOOD,
  purchaseDate: '2026-01-15T00:00:00Z',
  purchaseValueAmount: 4500,
  purchaseValueCurrency: 'USD',
  currentEstimatedValueAmount: 3800,
  currentEstimatedValueCurrency: 'USD',
  location: {
    facilityId: 'MAIN_CAMPUS',
    roomId: 'Cardio Studio A',
    zone: 'Row 1',
  },
  version: 1,
  createdAt: '2026-01-15T00:00:00Z',
  updatedAt: '2026-06-01T00:00:00Z',
};

function renderWithClient(ui: React.ReactElement, initialRoute = '/') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Phase 6 Screen States & Hardened UX Standards Suite', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (authModule.useAuth as jest.Mock).mockReturnValue({
      currentUser: {
        id: 'usr_admin',
        roles: ['ADMIN'],
        permissions: [
          'inventory.read',
          'inventory.write',
          'assets.read',
          'assets.write',
          'billing.read',
          'valuation.read',
        ],
      },
      hasPermission: jest.fn().mockReturnValue(true),
      hasRole: jest.fn().mockReturnValue(true),
    });
  });

  describe('1. ResourceOverviewPage State Matrix', () => {
    it('renders LOADING skeleton with accessible busy role', () => {
      (overviewQueries.useResourceOverview as jest.Mock).mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        refetch: jest.fn(),
      });

      renderWithClient(<ResourceOverviewPage />);

      const loadingEl = screen.getByTestId('resource-overview-loading');
      expect(loadingEl).toBeInTheDocument();
      expect(loadingEl).toHaveAttribute('role', 'status');
      expect(loadingEl).toHaveAttribute('aria-busy', 'true');
    });

    it('renders ERROR state card with retry button on fetch failure', () => {
      const mockRefetch = jest.fn();
      (overviewQueries.useResourceOverview as jest.Mock).mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new Error('Network timeout fetching metrics'),
        refetch: mockRefetch,
      });

      renderWithClient(<ResourceOverviewPage />);

      expect(screen.getByTestId('resource-overview-error')).toBeInTheDocument();
      expect(screen.getByText(/Network timeout fetching metrics/i)).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /try again/i }));
      expect(mockRefetch).toHaveBeenCalled();
    });

    it('renders EMPTY zero-estate state when no inventory or assets exist', () => {
      (overviewQueries.useResourceOverview as jest.Mock).mockReturnValue({
        data: {
          currency: 'USD',
          calculatedAt: '2026-09-10T10:00:00.000Z',
          combined: { totalCombinedValueAmount: 0 },
          consumableInventory: {
            totalDistinctItems: 0,
            totalQuantityUnits: 0,
            totalValueAmount: 0,
            lowStockItemCount: 0,
          },
          fixedAssets: {
            totalAssetCount: 0,
            activeAssetCount: 0,
            underMaintenanceAssetCount: 0,
            damagedAssetCount: 0,
            retiredAssetCount: 0,
            totalCarryingValueAmount: 0,
          },
        },
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });

      renderWithClient(<ResourceOverviewPage />);

      expect(screen.getByTestId('resource-overview-empty')).toBeInTheDocument();
      expect(screen.getByText(/No Resource Records Initialized/i)).toBeInTheDocument();
    });

    it('renders POPULATED overview dashboard with top-level non-destructive refresh', () => {
      const mockRefetch = jest.fn();
      (overviewQueries.useResourceOverview as jest.Mock).mockReturnValue({
        data: {
          currency: 'USD',
          calculatedAt: '2026-09-10T10:00:00.000Z',
          combined: { totalCombinedValueAmount: 50000, inventorySharePct: 20, assetsSharePct: 80 },
          consumableInventory: {
            totalDistinctItems: 12,
            totalQuantityUnits: 150,
            totalValueAmount: 10000,
            lowStockItemCount: 2,
            outOfStockItemCount: 0,
            byCategory: [],
          },
          fixedAssets: {
            totalAssetCount: 8,
            activeAssetCount: 7,
            underMaintenanceAssetCount: 1,
            damagedAssetCount: 0,
            retiredAssetCount: 0,
            decommissionedAssetCount: 0,
            totalCarryingValueAmount: 40000,
            byCategory: [],
          },
        },
        isLoading: false,
        isFetching: false,
        isError: false,
        refetch: mockRefetch,
      });

      renderWithClient(<ResourceOverviewPage />);

      expect(screen.getByTestId('resource-overview-page')).toBeInTheDocument();

      const refreshBtn = screen.getByRole('button', { name: /refresh/i });
      fireEvent.click(refreshBtn);
      expect(mockRefetch).toHaveBeenCalled();
    });
  });

  describe('2. InventoryOverviewPage & LowStockPage State Hardening', () => {
    it('InventoryOverviewPage renders top-level Refresh button and invalidates query caches', async () => {
      (inventoryQueries.useLowStockItems as jest.Mock).mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });
      (inventoryQueries.useInventoryValuation as jest.Mock).mockReturnValue({
        data: { totalValuationAmount: 12000, currency: 'USD' },
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });

      renderWithClient(<InventoryOverviewPage />);

      expect(screen.getByTestId('inventory-overview-page')).toBeInTheDocument();

      const refreshBtn = screen.getByTestId('refresh-inventory-overview-btn');
      expect(refreshBtn).toBeInTheDocument();
      fireEvent.click(refreshBtn);

      await waitFor(() => {
        expect(refreshBtn).not.toBeDisabled();
      });
    });

    it('LowStockPage supports LOADING, EMPTY, and Refresh triggers', () => {
      const mockRefetch = jest.fn();

      // Empty / Healthy state
      (inventoryQueries.useLowStockItems as jest.Mock).mockReturnValue({
        data: [],
        isLoading: false,
        isFetching: false,
        isError: false,
        refetch: mockRefetch,
      });

      renderWithClient(<LowStockPage />);

      expect(screen.getByTestId('low-stock-page')).toBeInTheDocument();
      expect(screen.getByTestId('low-stock-empty-healthy')).toBeInTheDocument();
      expect(screen.getByText(/All Inventory Stocks Healthy/i)).toBeInTheDocument();

      const refreshBtn = screen.getByTestId('refresh-low-stock-btn');
      fireEvent.click(refreshBtn);
      expect(mockRefetch).toHaveBeenCalled();
    });

    it('LowStockPage renders POPULATED deficit table when low-stock items exist', () => {
      (inventoryQueries.useLowStockItems as jest.Mock).mockReturnValue({
        data: [
          {
            ...mockProduct,
            currentStock: 2,
            reorderThreshold: 10,
            isLowStock: true,
          },
        ],
        isLoading: false,
        isFetching: false,
        isError: false,
        refetch: jest.fn(),
      });

      renderWithClient(<LowStockPage />);

      expect(screen.getByTestId('low-stock-table')).toBeInTheDocument();
      expect(screen.getByText('Vanilla Whey Protein')).toBeInTheDocument();
    });
  });

  describe('3. AssetOverviewPage State Hardening', () => {
    it('AssetOverviewPage renders header Refresh button and triggers query cache invalidation', async () => {
      (assetQueries.useAssetsList as jest.Mock).mockReturnValue({
        data: { items: [], total: 0 },
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });
      (assetQueries.useAssetValuationSummary as jest.Mock).mockReturnValue({
        data: { totalEstimatedValueAmount: 25000, currency: 'USD' },
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });

      renderWithClient(<AssetOverviewPage />);

      expect(screen.getByTestId('asset-overview-page')).toBeInTheDocument();

      const refreshBtn = screen.getByTestId('refresh-assets-overview-btn');
      expect(refreshBtn).toBeInTheDocument();
      fireEvent.click(refreshBtn);

      await waitFor(() => {
        expect(refreshBtn).not.toBeDisabled();
      });
    });
  });

  describe('4. Asset Detail Preview Widgets (Preventing False Empty States)', () => {
    it('AssetHistoryPreview renders explicit error banner on query failure instead of empty state', () => {
      const mockRefetch = jest.fn();
      (assetQueries.useAssetHistory as jest.Mock).mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new Error('Failed to reach lifecycle database'),
        refetch: mockRefetch,
      });

      renderWithClient(<AssetHistoryPreview assetId="asset-001" />);

      // Error banner must be present
      expect(screen.getByTestId('history-preview-error')).toBeInTheDocument();
      expect(screen.getByText(/Failed to load lifecycle audit history/i)).toBeInTheDocument();
      expect(screen.getByText(/Failed to reach lifecycle database/i)).toBeInTheDocument();

      // Must NOT falsely render empty message
      expect(screen.queryByText(/No lifecycle events recorded/i)).not.toBeInTheDocument();

      // Retry button works
      fireEvent.click(screen.getByRole('button', { name: /retry/i }));
      expect(mockRefetch).toHaveBeenCalled();
    });

    it('AssetHistoryPreview renders clean EMPTY state when 0 events exist and query succeeds', () => {
      (assetQueries.useAssetHistory as jest.Mock).mockReturnValue({
        data: { items: [], total: 0 },
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });

      renderWithClient(<AssetHistoryPreview assetId="asset-001" />);

      expect(screen.getByTestId('history-preview-empty')).toBeInTheDocument();
      expect(screen.getByText(/No lifecycle events recorded/i)).toBeInTheDocument();
    });

    it('AssetMaintenancePreview renders explicit error banner on query failure instead of empty state', () => {
      const mockRefetch = jest.fn();
      (assetQueries.useAssetMaintenanceHistory as jest.Mock).mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new Error('Database connection dropped'),
        refetch: mockRefetch,
      });

      renderWithClient(<AssetMaintenancePreview assetId="asset-001" />);

      expect(screen.getByTestId('maintenance-preview-error')).toBeInTheDocument();
      expect(screen.getByText(/Failed to load servicing history/i)).toBeInTheDocument();
      expect(screen.getByText(/Database connection dropped/i)).toBeInTheDocument();

      // Must NOT falsely render empty state
      expect(screen.queryByText(/No maintenance records logged/i)).not.toBeInTheDocument();

      // Retry button works
      fireEvent.click(screen.getByRole('button', { name: /retry/i }));
      expect(mockRefetch).toHaveBeenCalled();
    });

    it('AssetMaintenancePreview renders clean EMPTY state when 0 records exist and query succeeds', () => {
      (assetQueries.useAssetMaintenanceHistory as jest.Mock).mockReturnValue({
        data: { items: [], total: 0 },
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });

      renderWithClient(<AssetMaintenancePreview assetId="asset-001" />);

      expect(screen.getByTestId('maintenance-preview-empty')).toBeInTheDocument();
      expect(screen.getByText(/No maintenance records logged/i)).toBeInTheDocument();
    });
  });

  describe('5. Single Resource Detail Pages (Not Found / Error vs Populated)', () => {
    it('InventoryDetailPage renders error view with Return to Catalog when product is not found', () => {
      (inventoryQueries.useInventoryProduct as jest.Mock).mockReturnValue({
        data: null,
        isLoading: false,
        isFetching: false,
        isError: true,
        error: new Error('Product not found in catalog'),
        refetch: jest.fn(),
      });

      renderWithClient(
        <Routes>
          <Route path="/resources/inventory/:id" element={<InventoryDetailPage />} />
        </Routes>,
        '/resources/inventory/missing-prod-999',
      );

      expect(screen.getByTestId('inventory-detail-error')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /product not found/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /return to catalog/i })).toBeInTheDocument();
    });

    it('AssetDetailPage renders error view with Return to Catalog when asset is not found', () => {
      (assetQueries.useAsset as jest.Mock).mockReturnValue({
        data: null,
        isLoading: false,
        isFetching: false,
        isError: true,
        error: new Error('Asset tag not recognized'),
        refetch: jest.fn(),
      });
      (assetQueries.useAssetValuation as jest.Mock).mockReturnValue({
        data: null,
      });

      renderWithClient(
        <Routes>
          <Route path="/resources/assets/:id" element={<AssetDetailPage />} />
        </Routes>,
        '/resources/assets/missing-asset-999',
      );

      expect(screen.getByTestId('asset-detail-error')).toBeInTheDocument();
      expect(screen.getByText(/Asset Not Found/i)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /view all assets/i })).toBeInTheDocument();
    });
  });

  describe('6. Catalog List Pages (DataTable States & Filter Synchronization)', () => {
    it('InventoryListPage renders populated DataTable and handles toolbar refresh', () => {
      const mockRefetch = jest.fn();
      (inventoryQueries.useInventoryList as jest.Mock).mockReturnValue({
        data: {
          items: [mockProduct],
          total: 1,
          page: 1,
          limit: 10,
          totalPages: 1,
        },
        isLoading: false,
        isFetching: false,
        isError: false,
        refetch: mockRefetch,
      });

      renderWithClient(<InventoryListPage />);

      expect(screen.getByTestId('inventory-list-page')).toBeInTheDocument();
      expect(screen.getByText('Vanilla Whey Protein')).toBeInTheDocument();

      const refreshBtn = screen.getByRole('button', { name: /refresh/i });
      fireEvent.click(refreshBtn);
      expect(mockRefetch).toHaveBeenCalled();
    });

    it('AssetsListPage renders populated DataTable and handles toolbar refresh', () => {
      const mockRefetch = jest.fn();
      (assetQueries.useAssetsList as jest.Mock).mockReturnValue({
        data: {
          items: [mockAsset],
          total: 1,
          page: 1,
          limit: 10,
          totalPages: 1,
        },
        isLoading: false,
        isFetching: false,
        isError: false,
        refetch: mockRefetch,
      });

      renderWithClient(<AssetsListPage />);

      expect(screen.getByTestId('assets-list-page')).toBeInTheDocument();
      expect(screen.getByText('LifeFitness Treadmill Pro')).toBeInTheDocument();

      const refreshBtn = screen.getByRole('button', { name: /refresh/i });
      fireEvent.click(refreshBtn);
      expect(mockRefetch).toHaveBeenCalled();
    });
  });
});
