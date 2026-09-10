import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { axe, toHaveNoViolations } from 'jest-axe';
import {
  InventoryItemStatus,
  InventoryCategory,
  UnitOfMeasure,
  AssetStatus,
  AssetCondition,
  AssetCategory,
  StockMovementType,
} from '@kinergy-platform/core';

// Auth module mock
import * as authModule from '../../../app/providers/auth-provider';

// Inventory components & routes
import { StockLevelGauge } from '../inventory/components/stock-level-gauge';
import { LowStockAlertTable } from '../inventory/components/low-stock-alert-table';
import { LowStockAttentionQueue } from '../inventory/components/low-stock-attention-queue';
import { MovementHistoryTable } from '../inventory/components/movement-history-table';
import { AdjustStockDialog } from '../inventory/components/adjust-stock-dialog';
import { ReceiveStockDialog } from '../inventory/components/receive-stock-dialog';
import { InventoryDetailPage } from '../inventory/routes/inventory-detail-page';
import * as inventoryQueries from '../inventory/hooks/use-inventory-queries';
import * as inventoryMutations from '../inventory/hooks/use-inventory-mutations';

// Asset components & routes
import { AssetDetailPage } from '../assets/routes/asset-detail-page';
import { AssetAttentionQueue } from '../assets/components/asset-attention-queue';
import { AssetMaintenancePage } from '../assets/routes/asset-maintenance-page';
import { AssetHistoryPage } from '../assets/routes/asset-history-page';
import * as assetQueries from '../assets/hooks/use-assets-queries';

// Overview components & routes
import { ResourceOverviewPage } from '../overview/routes/resource-overview-page';
import * as overviewQueries from '../overview/hooks/use-resource-overview';

expect.extend(toHaveNoViolations);

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

jest.mock('../inventory/hooks/use-inventory-queries', () => {
  const actual = jest.requireActual('../inventory/hooks/use-inventory-queries');
  return {
    ...actual,
    useInventoryProduct: jest.fn(),
    useInventoryList: jest.fn(),
    useLowStockItems: jest.fn(),
    useInventoryValuation: jest.fn(),
    useStockMovements: jest.fn(),
  };
});

jest.mock('../inventory/hooks/use-inventory-mutations', () => ({
  useAdjustStock: jest.fn(),
  useReceiveStock: jest.fn(),
  useSellStock: jest.fn(),
  useConsumeStock: jest.fn(),
  useScrapStock: jest.fn(),
  useArchiveProduct: jest.fn(),
  useActivateProduct: jest.fn(),
}));

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
  };
});

jest.mock('../overview/hooks/use-resource-overview', () => ({
  useResourceOverview: jest.fn(),
}));

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function renderWithProviders(ui: React.ReactElement, { initialEntries = ['/'] } = {}) {
  const client = createTestQueryClient();
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

const mockProduct = {
  id: 'prod_100',
  tenantId: 'tenant_1',
  sku: 'PROT-WHEY-1KG',
  name: 'Grass-Fed Whey Isolate 1kg',
  description: 'Pure cold-filtered whey isolate.',
  category: InventoryCategory.SUPPLEMENTS,
  unitCost: { amount: 28.5, currency: 'USD' },
  sellingPrice: { amount: 59.99, currency: 'USD' },
  currentStock: 4,
  reorderThreshold: 10,
  unitOfMeasure: UnitOfMeasure.UNITS,
  status: InventoryItemStatus.ACTIVE,
  isLowStock: true,
  isOutOfStock: false,
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-08-05T00:00:00Z',
};

const mockAsset = {
  id: 'ast_100',
  tenantId: 'tenant_1',
  assetTag: 'AST-CAR-001',
  name: 'Treadmill Commercial Pro 9000',
  description: 'Heavy-duty commercial treadmill with telemetry.',
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
    description: 'Near north windows',
  },
  notes: 'Quarterly belt lubrication performed.',
  createdAt: '2026-01-15T00:00:00Z',
  updatedAt: '2026-06-01T00:00:00Z',
};

describe('Phase 6 Full Accessibility Hardening Suite', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (authModule.useAuth as jest.Mock).mockReturnValue({
      isAuthenticated: true,
      currentUser: {
        id: 'usr_admin',
        roles: ['ADMIN'],
        permissions: ['inventory.write', 'assets.write', 'valuation.read', 'billing.read'],
      },
      hasPermission: () => true,
      hasRole: () => true,
    });

    (inventoryMutations.useAdjustStock as jest.Mock).mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
    });
    (inventoryMutations.useReceiveStock as jest.Mock).mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
    });
    (inventoryMutations.useSellStock as jest.Mock).mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
    });
    (inventoryMutations.useConsumeStock as jest.Mock).mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
    });
    (inventoryMutations.useScrapStock as jest.Mock).mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
    });
    (inventoryMutations.useArchiveProduct as jest.Mock).mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
    });
    (inventoryMutations.useActivateProduct as jest.Mock).mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
    });
  });

  describe('1. Automated WCAG Accessibility Audits (jest-axe)', () => {
    it('passes automated axe audit on StockLevelGauge across all states', async () => {
      const { container, rerender } = render(
        <StockLevelGauge
          currentStock={25}
          reorderThreshold={5}
          unit="units"
          isLowStock={false}
          isOutOfStock={false}
        />,
      );
      let results = await axe(container);
      expect(results).toHaveNoViolations();

      // Low stock state
      rerender(
        <StockLevelGauge
          currentStock={3}
          reorderThreshold={5}
          unit="units"
          isLowStock={true}
          isOutOfStock={false}
        />,
      );
      results = await axe(container);
      expect(results).toHaveNoViolations();

      // Out of stock state
      rerender(
        <StockLevelGauge
          currentStock={0}
          reorderThreshold={5}
          unit="units"
          isLowStock={false}
          isOutOfStock={true}
        />,
      );
      results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('passes automated axe audit on LowStockAlertTable', async () => {
      (inventoryQueries.useLowStockItems as jest.Mock).mockReturnValue({
        data: [mockProduct],
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });

      const { container } = renderWithProviders(
        <LowStockAlertTable onReceiveStockClick={jest.fn()} />,
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('passes automated axe audit on LowStockAttentionQueue', async () => {
      const { container } = renderWithProviders(
        <LowStockAttentionQueue
          items={[mockProduct]}
          isLoading={false}
          isError={false}
          onRetry={jest.fn()}
          onReceiveStock={jest.fn()}
        />,
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('passes automated axe audit on MovementHistoryTable', async () => {
      const mockMovements = [
        {
          id: 'mov_1',
          itemId: 'prod_100',
          type: StockMovementType.PURCHASE,
          quantity: 20,
          previousBalance: 0,
          newBalance: 20,
          unitCost: { amount: 28.5, currency: 'USD' },
          sellingPrice: null,
          referenceNumber: 'PO-2026-001',
          reason: 'Initial replenishment stock',
          actorId: 'usr_admin',
          occurredAt: '2026-08-01T10:00:00Z',
        },
      ];

      const { container } = renderWithProviders(
        <MovementHistoryTable
          movements={mockMovements}
          unitOfMeasure="units"
          isLoading={false}
          isError={false}
          page={1}
          totalPages={1}
          totalCount={1}
          onPageChange={jest.fn()}
          isFiltered={false}
        />,
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('passes automated axe audit on AdjustStockDialog when open', async () => {
      const { container } = renderWithProviders(
        <AdjustStockDialog product={mockProduct} open={true} onOpenChange={jest.fn()} />,
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('passes automated axe audit on ReceiveStockDialog when open', async () => {
      const { container } = renderWithProviders(
        <ReceiveStockDialog product={mockProduct} open={true} onOpenChange={jest.fn()} />,
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('passes automated axe audit on InventoryDetailPage', async () => {
      (inventoryQueries.useInventoryProduct as jest.Mock).mockReturnValue({
        data: mockProduct,
        isLoading: false,
        isFetching: false,
        isError: false,
        refetch: jest.fn(),
      });
      (inventoryQueries.useStockMovements as jest.Mock).mockReturnValue({
        data: { items: [], total: 0, totalPages: 1 },
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });

      const { container } = renderWithProviders(<InventoryDetailPage />, {
        initialEntries: ['/resources/inventory/prod_100'],
      });
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('passes automated axe audit on AssetAttentionQueue', async () => {
      (assetQueries.useAssetsList as jest.Mock).mockImplementation(({ status }) => ({
        data: { items: status === AssetStatus.UNDER_MAINTENANCE ? [mockAsset] : [], total: 1 },
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      }));

      const { container } = renderWithProviders(<AssetAttentionQueue />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('passes automated axe audit on AssetDetailPage across tabs', async () => {
      (assetQueries.useAsset as jest.Mock).mockReturnValue({
        data: mockAsset,
        isLoading: false,
        isFetching: false,
        isError: false,
        refetch: jest.fn(),
      });
      (assetQueries.useAssetValuation as jest.Mock).mockReturnValue({
        data: { currentEstimatedValueAmount: 3800, purchaseValueAmount: 4500 },
      });
      (assetQueries.useAssetMaintenanceHistory as jest.Mock).mockReturnValue({
        data: { items: [], total: 0, totalPages: 1 },
        isLoading: false,
      });
      (assetQueries.useAssetHistory as jest.Mock).mockReturnValue({
        data: { items: [], total: 0, totalPages: 1 },
        isLoading: false,
      });

      const { container } = renderWithProviders(<AssetDetailPage />, {
        initialEntries: ['/resources/assets/ast_100'],
      });
      let results = await axe(container);
      expect(results).toHaveNoViolations();

      // Switch to Maintenance tab
      const maintenanceTab = screen.getByRole('tab', { name: /maintenance/i });
      fireEvent.click(maintenanceTab);
      results = await axe(container);
      expect(results).toHaveNoViolations();

      // Switch to History tab
      const historyTab = screen.getByRole('tab', { name: /audit ledger/i });
      fireEvent.click(historyTab);
      results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('passes automated axe audit on ResourceOverviewPage', async () => {
      (overviewQueries.useResourceOverview as jest.Mock).mockReturnValue({
        data: {
          combined: { totalCombinedValueAmount: 125000, totalCombinedDistinctAssets: 42 },
          consumableInventory: {
            totalValueAmount: 45000,
            lowStockItemCount: 2,
            totalDistinctItems: 30,
            totalQuantityUnits: 500,
          },
          fixedAssets: {
            totalCarryingValueAmount: 80000,
            activeAssetCount: 10,
            underMaintenanceAssetCount: 1,
            damagedAssetCount: 0,
            retiredAssetCount: 1,
            totalAssetCount: 12,
          },
          currency: 'USD',
          calculatedAt: '2026-09-10T12:00:00Z',
        },
        isLoading: false,
        isFetching: false,
        isError: false,
        refetch: jest.fn(),
      });

      const { container } = renderWithProviders(<ResourceOverviewPage />, {
        initialEntries: ['/resources/overview'],
      });
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe('2. Keyboard Navigation & Tab / Focus Semantics', () => {
    it('manages tab semantics with role="tablist", role="tab", aria-selected, and aria-controls on AssetDetailPage', () => {
      (assetQueries.useAsset as jest.Mock).mockReturnValue({
        data: mockAsset,
        isLoading: false,
        isFetching: false,
        isError: false,
        refetch: jest.fn(),
      });
      (assetQueries.useAssetValuation as jest.Mock).mockReturnValue({ data: null });
      (assetQueries.useAssetMaintenanceHistory as jest.Mock).mockReturnValue({
        data: { items: [], total: 0, totalPages: 1 },
      });
      (assetQueries.useAssetHistory as jest.Mock).mockReturnValue({
        data: { items: [], total: 0, totalPages: 1 },
      });

      renderWithProviders(<AssetDetailPage />, { initialEntries: ['/resources/assets/ast_100'] });

      const tablist = screen.getByRole('tablist', { name: /asset detail sections/i });
      expect(tablist).toBeInTheDocument();

      const overviewTab = screen.getByRole('tab', { name: /specifications/i });
      const maintenanceTab = screen.getByRole('tab', { name: /maintenance/i });
      const historyTab = screen.getByRole('tab', { name: /audit ledger/i });

      // Initially Overview tab is active
      expect(overviewTab).toHaveAttribute('aria-selected', 'true');
      expect(maintenanceTab).toHaveAttribute('aria-selected', 'false');
      expect(historyTab).toHaveAttribute('aria-selected', 'false');

      // The overview panel is rendered and associated
      const overviewPanel = screen.getByRole('tabpanel');
      expect(overviewPanel).toHaveAttribute('id', 'asset-panel-overview');
      expect(overviewPanel).toHaveAttribute('aria-labelledby', 'asset-tab-overview');

      // Activate Maintenance tab via keyboard click
      fireEvent.click(maintenanceTab);
      expect(overviewTab).toHaveAttribute('aria-selected', 'false');
      expect(maintenanceTab).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'asset-panel-maintenance');

      // Activate History tab via keyboard click
      fireEvent.click(historyTab);
      expect(historyTab).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'asset-panel-history');
    });

    it('supports direction toggle with role="group", aria-labelledby, and aria-pressed in AdjustStockDialog', () => {
      renderWithProviders(
        <AdjustStockDialog product={mockProduct} open={true} onOpenChange={jest.fn()} />,
      );

      const group = screen.getByRole('group', { name: /adjustment direction/i });
      expect(group).toBeInTheDocument();

      const inBtn = screen.getByTestId('direction-in-btn');
      const outBtn = screen.getByTestId('direction-out-btn');

      // Initially "IN" is pressed
      expect(inBtn).toHaveAttribute('aria-pressed', 'true');
      expect(outBtn).toHaveAttribute('aria-pressed', 'false');

      // Press "OUT"
      fireEvent.click(outBtn);
      expect(inBtn).toHaveAttribute('aria-pressed', 'false');
      expect(outBtn).toHaveAttribute('aria-pressed', 'true');
    });

    it('provides accessible escape key handling on modal dialogs', () => {
      const onOpenChange = jest.fn();
      renderWithProviders(
        <AdjustStockDialog product={mockProduct} open={true} onOpenChange={onOpenChange} />,
      );

      // Escape key down
      fireEvent.keyDown(screen.getByTestId('adjust-stock-dialog'), {
        key: 'Escape',
        code: 'Escape',
      });
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe('3. Screen Reader Labels & Table Semantics', () => {
    it('verifies explicit accessible names and scope="col" on LowStockAlertTable', () => {
      (inventoryQueries.useLowStockItems as jest.Mock).mockReturnValue({
        data: [mockProduct],
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });

      renderWithProviders(<LowStockAlertTable onReceiveStockClick={jest.fn()} />);

      const table = screen.getByRole('table', { name: /low-stock attention queue items/i });
      expect(table).toBeInTheDocument();

      const headers = screen.getAllByRole('columnheader');
      expect(headers.length).toBe(5);
      headers.forEach((h) => expect(h).toHaveAttribute('scope', 'col'));
    });

    it('verifies explicit accessible names and scope="col" on MovementHistoryTable', () => {
      const mockMovements = [
        {
          id: 'mov_1',
          itemId: 'prod_100',
          type: StockMovementType.PURCHASE,
          quantity: 20,
          previousBalance: 0,
          newBalance: 20,
          unitCost: { amount: 28.5, currency: 'USD' },
          sellingPrice: null,
          referenceNumber: 'PO-2026-001',
          reason: 'Initial replenishment stock',
          actorId: 'usr_admin',
          occurredAt: '2026-08-01T10:00:00Z',
        },
      ];

      renderWithProviders(
        <MovementHistoryTable
          movements={mockMovements}
          unitOfMeasure="units"
          isLoading={false}
          isError={false}
          page={1}
          totalPages={3}
          totalCount={25}
          onPageChange={jest.fn()}
          isFiltered={false}
        />,
      );

      const table = screen.getByRole('table', { name: /stock movement history ledger/i });
      expect(table).toBeInTheDocument();

      const headers = screen.getAllByRole('columnheader');
      expect(headers.length).toBe(6);
      headers.forEach((h) => expect(h).toHaveAttribute('scope', 'col'));

      // Pagination landmark
      const paginationNav = screen.getByRole('navigation', {
        name: /movement history pagination/i,
      });
      expect(paginationNav).toBeInTheDocument();

      expect(screen.getByRole('button', { name: /go to previous page/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /go to next page/i })).toBeInTheDocument();
    });

    it('verifies accessible filter select and pagination navigation in AssetHistoryPage', () => {
      (assetQueries.useAsset as jest.Mock).mockReturnValue({
        data: mockAsset,
        isLoading: false,
        error: null,
      });
      (assetQueries.useAssetHistory as jest.Mock).mockReturnValue({
        data: {
          items: [
            {
              id: 'evt_1',
              assetId: 'ast_100',
              eventType: 'CREATED',
              description: 'Asset commissioned',
              recordedAt: '2026-01-15T00:00:00Z',
              recordedByUserId: 'usr_admin',
              details: {},
            },
          ],
          total: 15,
          totalPages: 2,
        },
        isLoading: false,
        isFetching: false,
        error: null,
      });

      renderWithProviders(<AssetHistoryPage />, {
        initialEntries: ['/resources/assets/ast_100/history'],
      });

      const select = screen.getByRole('combobox', {
        name: /filter lifecycle events by event type/i,
      });
      expect(select).toBeInTheDocument();

      const sortBtn = screen.getByRole('button', {
        name: /sort lifecycle events/i,
      });
      expect(sortBtn).toBeInTheDocument();

      const paginationNav = screen.getByRole('navigation', {
        name: /lifecycle history pagination/i,
      });
      expect(paginationNav).toBeInTheDocument();
    });

    it('verifies technician input label and pagination navigation in AssetMaintenancePage', () => {
      (assetQueries.useAsset as jest.Mock).mockReturnValue({
        data: mockAsset,
        isLoading: false,
        error: null,
      });
      (assetQueries.useAssetMaintenanceHistory as jest.Mock).mockReturnValue({
        data: {
          items: [],
          total: 10,
          totalPages: 2,
        },
        isLoading: false,
        isFetching: false,
        error: null,
      });

      renderWithProviders(<AssetMaintenancePage />, {
        initialEntries: ['/resources/assets/ast_100/maintenance'],
      });

      const techInput = screen.getByRole('textbox', {
        name: /filter maintenance records by technician or vendor/i,
      });
      expect(techInput).toBeInTheDocument();

      const paginationNav = screen.getByRole('navigation', {
        name: /maintenance ledger pagination/i,
      });
      expect(paginationNav).toBeInTheDocument();
    });
  });

  describe('4. Non-Color-Alone Status Communication', () => {
    it('announces stock health textually via StockLevelGauge without relying solely on color', () => {
      const { rerender } = render(
        <StockLevelGauge
          currentStock={2}
          reorderThreshold={10}
          unit="bottles"
          isLowStock={true}
          isOutOfStock={false}
        />,
      );

      const statusElement = screen.getByRole('status');
      expect(statusElement).toHaveAttribute(
        'aria-label',
        'Stock level: 2 bottles, Low Stock, at or below threshold of 10 bottles',
      );
      expect(screen.getByText(/low stock/i)).toBeInTheDocument();

      // Zero stock
      rerender(
        <StockLevelGauge
          currentStock={0}
          reorderThreshold={10}
          unit="bottles"
          isLowStock={false}
          isOutOfStock={true}
        />,
      );
      expect(statusElement).toHaveAttribute(
        'aria-label',
        'Stock level: 0 bottles, Out of Stock (Reorder threshold: 10)',
      );
      expect(screen.getByText(/out of stock/i)).toBeInTheDocument();
    });
  });

  describe('5. Live Regions & Loading / Error Announcements', () => {
    it('verifies role="status" and aria-busy="true" during loading states across screens', () => {
      // Inventory Detail loading
      (inventoryQueries.useInventoryProduct as jest.Mock).mockReturnValue({
        data: null,
        isLoading: true,
        isFetching: true,
        isError: false,
      });

      const { unmount } = renderWithProviders(<InventoryDetailPage />, {
        initialEntries: ['/resources/inventory/prod_100'],
      });

      const loadingRegion = screen.getByTestId('inventory-detail-loading');
      expect(loadingRegion).toHaveAttribute('role', 'status');
      expect(loadingRegion).toHaveAttribute('aria-busy', 'true');
      expect(screen.getByText(/loading product details/i)).toBeInTheDocument();
      unmount();

      // Resource Overview loading
      (overviewQueries.useResourceOverview as jest.Mock).mockReturnValue({
        data: null,
        isLoading: true,
        isFetching: true,
        isError: false,
      });

      renderWithProviders(<ResourceOverviewPage />, {
        initialEntries: ['/resources/overview'],
      });
      const overviewLoading = screen.getByTestId('resource-overview-loading');
      expect(overviewLoading).toHaveAttribute('role', 'status');
      expect(overviewLoading).toHaveAttribute('aria-busy', 'true');
      expect(screen.getByText(/loading resource overview metrics/i)).toBeInTheDocument();
    });

    it('verifies role="alert" during asynchronous failure / error states', () => {
      (inventoryQueries.useInventoryProduct as jest.Mock).mockReturnValue({
        data: null,
        isLoading: false,
        isFetching: false,
        isError: true,
        error: new Error('Catalog database offline'),
      });

      renderWithProviders(<InventoryDetailPage />, {
        initialEntries: ['/resources/inventory/prod_100'],
      });

      const alertRegion = screen.getByRole('alert');
      expect(alertRegion).toBeInTheDocument();
      expect(screen.getByText(/product not found/i)).toBeInTheDocument();
    });
  });
});
