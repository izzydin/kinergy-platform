import { configure, render, screen } from '@testing-library/react';

// Resource routes are code-split; cold dynamic imports can exceed the default 1s timeout under load.
configure({ asyncUtilTimeout: 5000 });
jest.setTimeout(15000);
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../../../../app/providers/auth-provider';
import { NotificationProvider } from '../../../../app/providers/notification-provider';
import { FeatureFlagProvider } from '../../../../app/providers/feature-flag-provider';
import { NavigationProvider } from '../../../../app/navigation/navigation-provider';
import { BreadcrumbProvider } from '../../../../app/breadcrumbs/breadcrumb-provider';
import { SlotProvider } from '../../../../shared/ui/slots';
import { AppRouter } from '../../../../app/routes/app-router';
import type { AuthUser } from '../../../auth/domain/auth-state.types';
import * as inventoryHooks from '../hooks';

jest.mock('../../overview/hooks/use-resource-overview', () => ({
  useResourceOverview: jest.fn().mockReturnValue({
    data: {
      consumableInventory: {
        totalValueAmount: 50000,
        lowStockItemCount: 2,
        totalDistinctItems: 10,
        totalQuantityUnits: 500,
      },
      fixedAssets: {
        totalCarryingValueAmount: 150000,
        activeAssetCount: 5,
        underMaintenanceAssetCount: 1,
        damagedAssetCount: 0,
        retiredAssetCount: 0,
        totalAssetCount: 6,
      },
      combined: {
        totalCombinedValueAmount: 200000,
      },
      currency: 'USD',
      calculatedAt: '2026-09-06T15:00:00.000Z',
    },
    isLoading: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
    isFetching: false,
  }),
}));

jest.mock('../hooks', () => {
  const actual = jest.requireActual('../hooks');
  return {
    ...actual,
    useInventoryList: jest.fn(),
    useInventoryProduct: jest.fn(),
    useStockMovements: jest.fn(),
    useLowStockItems: jest.fn(),
    useCreateProduct: jest.fn(),
    useUpdateProduct: jest.fn(),
    useActivateProduct: jest.fn(),
    useReceiveStock: jest.fn(),
    useSellStock: jest.fn(),
    useAdjustStock: jest.fn(),
    useConsumeStock: jest.fn(),
    useScrapStock: jest.fn(),
    useArchiveProduct: jest.fn(),
  };
});

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
}

import {
  InventoryCategory,
  InventoryItemStatus,
  UnitOfMeasure,
  type InventoryProductVM,
} from '../types';

const mockProduct: InventoryProductVM = {
  id: 'prod-101',
  sku: 'PROD-101',
  name: 'Electrolyte Hydration 500g',
  description: 'High potency electrolyte formula.',
  category: InventoryCategory.SUPPLEMENTS,
  unitOfMeasure: UnitOfMeasure.UNITS,
  unitCost: { amount: 12.5, currency: 'USD' },
  sellingPrice: { amount: 22.0, currency: 'USD' },
  currentStock: 50,
  reorderThreshold: 10,
  isLowStock: false,
  isOutOfStock: false,
  status: InventoryItemStatus.ACTIVE,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const READONLY_INVENTORY_AUDITOR: AuthUser = {
  id: 'usr-inv-reader',
  email: 'auditor@kinergy.io',
  name: 'Inventory Auditor',
  roles: ['AUDITOR'],
  permissions: ['inventory.read'],
  tenantId: 'tenant-test',
};

const WRITE_INVENTORY_STAFF: AuthUser = {
  id: 'usr-inv-staff',
  email: 'kitchen@kinergy.io',
  name: 'Kitchen Staff Member',
  roles: ['Kitchen Staff'],
  permissions: ['inventory.read', 'inventory.write'],
  tenantId: 'tenant-test',
};

const EXECUTIVE_ADMIN: AuthUser = {
  id: 'usr-admin',
  email: 'admin@kinergy.io',
  name: 'Executive Owner',
  roles: ['ADMIN'],
  permissions: ['inventory.read', 'inventory.write', 'assets.read', 'assets.write', 'billing.read'],
  tenantId: 'tenant-test',
};

const UNAUTHORIZED_USER: AuthUser = {
  id: 'usr-unauth',
  email: 'member@kinergy.io',
  name: 'Gym Member',
  roles: ['MEMBER'],
  permissions: ['client:read'],
  tenantId: 'tenant-test',
};

function renderWithRoute(initialEntry: string, user: AuthUser) {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <SlotProvider>
          <NotificationProvider>
            <AuthProvider initialSessionOverride={user}>
              <FeatureFlagProvider>
                <NavigationProvider>
                  <BreadcrumbProvider>
                    <AppRouter />
                  </BreadcrumbProvider>
                </NavigationProvider>
              </FeatureFlagProvider>
            </AuthProvider>
          </NotificationProvider>
        </SlotProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Consumable Inventory Routing, Deep-Linking & Route Guards', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (inventoryHooks.useInventoryList as jest.Mock).mockReturnValue({
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
      error: null,
      refetch: jest.fn(),
    });

    (inventoryHooks.useInventoryProduct as jest.Mock).mockImplementation((id?: string) => {
      if (id === 'prod-missing') {
        return {
          data: null,
          isLoading: false,
          isFetching: false,
          isError: true,
          error: new Error('Inventory product not found.'),
          refetch: jest.fn(),
        };
      }
      return {
        data: mockProduct,
        isLoading: false,
        isFetching: false,
        isError: false,
        error: null,
        refetch: jest.fn(),
      };
    });

    (inventoryHooks.useStockMovements as jest.Mock).mockReturnValue({
      data: {
        items: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 1,
      },
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    (inventoryHooks.useLowStockItems as jest.Mock).mockReturnValue({
      data: [],
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    (inventoryHooks.useCreateProduct as jest.Mock).mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
      error: null,
    });

    (inventoryHooks.useUpdateProduct as jest.Mock).mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
      error: null,
    });

    (inventoryHooks.useActivateProduct as jest.Mock).mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
    });

    (inventoryHooks.useReceiveStock as jest.Mock).mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
    });

    (inventoryHooks.useSellStock as jest.Mock).mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
    });

    (inventoryHooks.useAdjustStock as jest.Mock).mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
    });

    (inventoryHooks.useConsumeStock as jest.Mock).mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
    });

    (inventoryHooks.useScrapStock as jest.Mock).mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
    });

    (inventoryHooks.useArchiveProduct as jest.Mock).mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. Read-Only Inventory Auditor (inventory.read)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('1. Read-Only Inventory Auditor (inventory.read)', () => {
    it('allows access to inventory catalog route (/resources/inventory)', async () => {
      renderWithRoute('/resources/inventory', READONLY_INVENTORY_AUDITOR);
      expect(await screen.findByTestId('inventory-list-page')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Consumable Inventory' })).toBeInTheDocument();
      // Write action should NOT be visible
      expect(screen.queryByText('Register Product')).not.toBeInTheDocument();
    });

    it('allows access to inventory detail cockpit route (/resources/inventory/prod-101)', async () => {
      renderWithRoute('/resources/inventory/prod-101', READONLY_INVENTORY_AUDITOR);
      expect(await screen.findByTestId('inventory-detail-page')).toBeInTheDocument();
      expect(screen.getByText('Electrolyte Hydration 500g')).toBeInTheDocument();
      // Mutation buttons should NOT be visible
      expect(screen.queryByTestId('action-receive-stock')).not.toBeInTheDocument();
      expect(screen.queryByTestId('action-edit-product')).not.toBeInTheDocument();
    });

    it('allows access to stock movement history route (/resources/inventory/prod-101/movements)', async () => {
      renderWithRoute('/resources/inventory/prod-101/movements', READONLY_INVENTORY_AUDITOR);
      expect(await screen.findByTestId('inventory-movements-page')).toBeInTheDocument();
      expect(screen.getByTestId('back-to-product-link')).toBeInTheDocument();
    });

    it('allows access to low stock attention queue (/resources/inventory/low-stock)', async () => {
      renderWithRoute('/resources/inventory/low-stock', READONLY_INVENTORY_AUDITOR);
      expect(await screen.findByTestId('low-stock-page')).toBeInTheDocument();
      expect(screen.getByText('Low Stock Attention Queue')).toBeInTheDocument();
    });

    it('denies access to create product route (/resources/inventory/new) with 403 Forbidden', async () => {
      renderWithRoute('/resources/inventory/new', READONLY_INVENTORY_AUDITOR);
      expect(
        await screen.findByRole('heading', { name: /403 — Access Denied/i }),
      ).toBeInTheDocument();
      expect(screen.queryByTestId('product-create-form')).not.toBeInTheDocument();
    });

    it('denies access to edit product route (/resources/inventory/prod-101/edit) with 403 Forbidden', async () => {
      renderWithRoute('/resources/inventory/prod-101/edit', READONLY_INVENTORY_AUDITOR);
      expect(
        await screen.findByRole('heading', { name: /403 — Access Denied/i }),
      ).toBeInTheDocument();
      expect(screen.queryByTestId('inventory-edit-page')).not.toBeInTheDocument();
    });

    it('strips deep-link ?action=receive and suppresses mutation dialog for read-only user', async () => {
      renderWithRoute('/resources/inventory/prod-101?action=receive', READONLY_INVENTORY_AUDITOR);
      expect(await screen.findByTestId('inventory-detail-page')).toBeInTheDocument();
      // Dialog should NOT open
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. Write-Authorized Staff (inventory.read + inventory.write)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('2. Write-Authorized Staff (inventory.read + inventory.write)', () => {
    it('allows access to create product route (/resources/inventory/new)', async () => {
      renderWithRoute('/resources/inventory/new', WRITE_INVENTORY_STAFF);
      expect(await screen.findByText('Register Consumable Product')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /register product/i })).toBeInTheDocument();
    });

    it('allows access to edit product route (/resources/inventory/prod-101/edit)', async () => {
      renderWithRoute('/resources/inventory/prod-101/edit', WRITE_INVENTORY_STAFF);
      expect(await screen.findByTestId('inventory-edit-page')).toBeInTheDocument();
      expect(screen.getByText(/Edit Electrolyte Hydration 500g/i)).toBeInTheDocument();
    });

    it('smoothly opens mutation dialog when authorized user uses deep-link ?action=receive', async () => {
      renderWithRoute('/resources/inventory/prod-101?action=receive', WRITE_INVENTORY_STAFF);
      expect(await screen.findByTestId('inventory-detail-page')).toBeInTheDocument();
      expect(await screen.findByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText(/Receive Inventory Batch/i)).toBeInTheDocument();
    });

    it('smoothly redirects /resources to /resources/inventory for inventory-only staff', async () => {
      renderWithRoute('/resources', WRITE_INVENTORY_STAFF);
      expect(await screen.findByTestId('inventory-list-page')).toBeInTheDocument();
    });

    it('smoothly redirects /resources/valuation to /resources/inventory/overview for inventory staff', async () => {
      renderWithRoute('/resources/valuation', WRITE_INVENTORY_STAFF);
      expect(await screen.findByTestId('inventory-overview-page')).toBeInTheDocument();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. Executive Admin (full resources & valuation)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('3. Executive Admin (full permissions)', () => {
    it('renders combined ResourceOverviewPage at /resources and /resources/valuation', async () => {
      const { unmount } = renderWithRoute('/resources', EXECUTIVE_ADMIN);
      expect(await screen.findByTestId('resource-overview-page')).toBeInTheDocument();
      unmount();

      renderWithRoute('/resources/valuation', EXECUTIVE_ADMIN);
      expect(await screen.findByTestId('resource-overview-page')).toBeInTheDocument();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. Missing Entity & Negative Paths
  // ─────────────────────────────────────────────────────────────────────────────
  describe('4. Missing Entity & Negative Paths', () => {
    it('renders clean Product Not Found state when product does not exist, with return to catalog', async () => {
      renderWithRoute('/resources/inventory/prod-missing', READONLY_INVENTORY_AUDITOR);
      expect(await screen.findByTestId('inventory-detail-error')).toBeInTheDocument();
      expect(screen.getByText('Product Not Found')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /return to catalog/i })).toBeInTheDocument();
    });

    it('renders clean Product Not Found state for movements route when product missing', async () => {
      renderWithRoute('/resources/inventory/prod-missing/movements', READONLY_INVENTORY_AUDITOR);
      expect(await screen.findByTestId('inventory-movements-product-error')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /back to catalog/i })).toBeInTheDocument();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. Unauthorized User (no inventory claims)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('5. Unauthorized User (missing inventory claims)', () => {
    it('blocks direct navigation to /resources/inventory with 403 Forbidden', async () => {
      renderWithRoute('/resources/inventory', UNAUTHORIZED_USER);
      expect(
        await screen.findByRole('heading', { name: /403 — Access Denied/i }),
      ).toBeInTheDocument();
      expect(screen.queryByTestId('inventory-list-page')).not.toBeInTheDocument();
    });

    it('blocks direct navigation to /resources/inventory/prod-101 with 403 Forbidden', async () => {
      renderWithRoute('/resources/inventory/prod-101', UNAUTHORIZED_USER);
      expect(
        await screen.findByRole('heading', { name: /403 — Access Denied/i }),
      ).toBeInTheDocument();
      expect(screen.queryByTestId('inventory-detail-page')).not.toBeInTheDocument();
    });
  });
});
