import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  InventoryItemStatus,
  InventoryCategory,
  AssetStatus,
  AssetCondition,
} from '@kinergy-platform/core';

// Auth module mock
import * as authModule from '../../../app/providers/auth-provider';

// Inventory components & routes
import { InventoryDetailPage } from '../inventory/routes/inventory-detail-page';
import { InventoryListPage } from '../inventory/routes/inventory-list-page';
import { LowStockAlertTable } from '../inventory/components/low-stock-alert-table';
import { InventoryOverviewSummary } from '../inventory/components/inventory-overview-summary';
import { ReceiveStockDialog } from '../inventory/components/receive-stock-dialog';
import * as inventoryQueries from '../inventory/hooks/use-inventory-queries';
import * as inventoryMutations from '../inventory/hooks/use-inventory-mutations';

// Asset components & routes
import { AssetDetailPage } from '../assets/routes/asset-detail-page';
import { AssetsListPage } from '../assets/routes/assets-list-page';
import { AssetMaintenancePage } from '../assets/routes/asset-maintenance-page';
import { AssetOverviewSummary } from '../assets/components/asset-overview-summary';
import * as assetQueries from '../assets/hooks/use-assets-queries';

// Route guards
import { RequirePermission } from '../../../app/routes/permission-guard';

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
    useInventoryCategories: jest.fn(),
    useStockLevel: jest.fn(),
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
  };
});

describe('Phase 6 Permission-Aware UX Security Audit', () => {
  let queryClient: QueryClient;

  // Mock domain entities
  const mockProduct = {
    id: 'prod-101',
    sku: 'SKU-WHEY-001',
    name: 'Whey Protein Isolate 1kg',
    description: 'Ultra-pure isolate protein powder',
    category: InventoryCategory.SUPPLEMENTS,
    unitOfMeasure: 'BOTTLE',
    currentStock: 15,
    reorderThreshold: 10,
    sellingPrice: { amount: 49.99, currency: 'USD' },
    unitCost: { amount: 24.5, currency: 'USD' },
    status: InventoryItemStatus.ACTIVE,
    isLowStock: false,
    isOutOfStock: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-10T00:00:00.000Z',
  };

  const mockActiveAsset = {
    id: 'ast-201',
    assetTag: 'AST-TREADMILL-01',
    name: 'Commercial Pro Treadmill X',
    category: 'CARDIO_MACHINERY',
    status: AssetStatus.ACTIVE,
    condition: AssetCondition.GOOD,
    purchaseDate: '2025-05-15',
    purchaseValueAmount: 4500.0,
    purchaseValueCurrency: 'USD',
    currentEstimatedValueAmount: 3800.0,
    currentEstimatedValueCurrency: 'USD',
    location: {
      facilityId: 'gym-main',
      roomId: 'cardio-zone-1',
    },
    createdAt: '2025-05-15T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
  };

  const mockRetiredAsset = {
    ...mockActiveAsset,
    id: 'ast-999',
    status: AssetStatus.RETIRED,
    condition: AssetCondition.OUT_OF_SERVICE,
  };

  // User profiles
  const permittedUser = {
    id: 'user-manager',
    name: 'Operations Manager',
    email: 'ops@kinergy.io',
    roles: ['ADMIN', 'OPERATOR'],
    permissions: [
      'inventory.read',
      'inventory.write',
      'assets.read',
      'assets.write',
      'valuation.read',
      'billing.read',
    ],
  };

  const restrictedUser = {
    id: 'user-trainee',
    name: 'Junior Trainee',
    email: 'trainee@kinergy.io',
    roles: ['TRAINEE'],
    permissions: ['inventory.read', 'assets.read'], // Read-only; NO write, NO valuation
  };

  const setupAuth = (user = permittedUser) => {
    (authModule.useAuth as jest.Mock).mockReturnValue({
      currentUser: user,
      isAuthenticated: true,
      hasRole: (role: string) => user.roles.includes(role),
      hasPermission: (perm: string) => user.permissions.includes(perm),
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    // Default mock query returns
    (inventoryQueries.useInventoryProduct as jest.Mock).mockReturnValue({
      data: mockProduct,
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: jest.fn(),
    });

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
      refetch: jest.fn(),
    });

    (inventoryQueries.useStockMovements as jest.Mock).mockReturnValue({
      data: { items: [], total: 0, page: 1, limit: 10, totalPages: 1 },
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: jest.fn(),
    });

    (inventoryQueries.useLowStockItems as jest.Mock).mockReturnValue({
      data: [mockProduct],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    (inventoryQueries.useInventoryValuation as jest.Mock).mockReturnValue({
      data: {
        totalValueAmount: 12500.0,
        currency: 'USD',
        totalDistinctItems: 5,
        totalQuantityUnits: 150,
      },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    (assetQueries.useAsset as jest.Mock).mockReturnValue({
      data: mockActiveAsset,
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: jest.fn(),
    });

    (assetQueries.useAssetsList as jest.Mock).mockReturnValue({
      data: {
        items: [mockActiveAsset],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      },
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: jest.fn(),
    });

    (assetQueries.useAssetValuation as jest.Mock).mockReturnValue({
      data: {
        purchaseValueAmount: 4500.0,
        currentEstimatedValueAmount: 3800.0,
      },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    (assetQueries.useAssetValuationSummary as jest.Mock).mockReturnValue({
      data: {
        totalCarryingValueAmount: 45000.0,
        totalPurchaseValueAmount: 50000.0,
        currency: 'USD',
      },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    (assetQueries.useAssetMaintenanceHistory as jest.Mock).mockReturnValue({
      data: { items: [], total: 0, totalPages: 1 },
      isLoading: false,
      isFetching: false,
      refetch: jest.fn(),
    });
  });

  describe('1. Permitted User Full Capabilities', () => {
    beforeEach(() => {
      setupAuth(permittedUser);
    });

    test('renders creation, editing, mutation, and valuation actions in InventoryListPage', () => {
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/resources/inventory']}>
            <InventoryListPage />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Primary register button is visible
      expect(screen.getByText(/Register Product/i)).toBeInTheDocument();

      // Unit cost column header is present for authorized user
      expect(screen.getByText(/Unit Cost/i)).toBeInTheDocument();
    });

    test('renders all mutation and archive actions on InventoryDetailPage', () => {
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/resources/inventory/prod-101']}>
            <InventoryDetailPage />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Mutation buttons are visible
      expect(screen.getByTestId('action-receive-stock')).toBeInTheDocument();
      expect(screen.getByTestId('action-sell-stock')).toBeInTheDocument();
      expect(screen.getByTestId('action-consume-stock')).toBeInTheDocument();
      expect(screen.getByTestId('action-adjust-stock')).toBeInTheDocument();
      expect(screen.getByTestId('action-scrap-stock')).toBeInTheDocument();
      expect(screen.getByTestId('action-edit-product')).toBeInTheDocument();
      expect(screen.getByTestId('action-archive-product')).toBeInTheDocument();

      // Unmasked purchase unit cost is visible
      expect(screen.getByText('$24.50')).toBeInTheDocument();
    });

    test('renders Receive Stock button in LowStockAlertTable', () => {
      const onReceiveMock = jest.fn();
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <LowStockAlertTable onReceiveStockClick={onReceiveMock} />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      expect(screen.getByRole('button', { name: /Receive Stock/i })).toBeInTheDocument();
    });

    test('renders commissioning and valuation in AssetsListPage and AssetDetailPage', () => {
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/resources/assets']}>
            <AssetsListPage />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      expect(screen.getByText(/Commission New Asset/i)).toBeInTheDocument();
      expect(screen.getByText(/Valuation/i)).toBeInTheDocument();
    });

    test('renders Record Work Order button on AssetMaintenancePage', () => {
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/resources/assets/ast-201/maintenance']}>
            <Routes>
              <Route path="/resources/assets/:id/maintenance" element={<AssetMaintenancePage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      expect(screen.getByTestId('open-record-maintenance-btn')).toBeInTheDocument();
    });
  });

  describe('2. Restricted User Gating & Hidden Actions', () => {
    beforeEach(() => {
      setupAuth(restrictedUser);
    });

    test('hides Register Product button and Unit Cost column in InventoryListPage', () => {
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/resources/inventory']}>
            <InventoryListPage />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Register button is hidden
      expect(screen.queryByText(/Register Product/i)).not.toBeInTheDocument();

      // Confidential Unit Cost column is hidden
      expect(screen.queryByText(/Unit Cost/i)).not.toBeInTheDocument();
    });

    test('hides mutation buttons and masks unit cost in InventoryDetailPage', () => {
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/resources/inventory/prod-101']}>
            <InventoryDetailPage />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // All write & destructive actions are hidden
      expect(screen.queryByTestId('action-receive-stock')).not.toBeInTheDocument();
      expect(screen.queryByTestId('action-sell-stock')).not.toBeInTheDocument();
      expect(screen.queryByTestId('action-consume-stock')).not.toBeInTheDocument();
      expect(screen.queryByTestId('action-adjust-stock')).not.toBeInTheDocument();
      expect(screen.queryByTestId('action-scrap-stock')).not.toBeInTheDocument();
      expect(screen.queryByTestId('action-edit-product')).not.toBeInTheDocument();
      expect(screen.queryByTestId('action-archive-product')).not.toBeInTheDocument();

      // Purchase unit cost is masked with confidential indicator
      expect(screen.getByText(/Restricted \(valuation\.read\)/i)).toBeInTheDocument();
      expect(screen.queryByText('$24.50')).not.toBeInTheDocument();
    });

    test('hides Receive Stock button in LowStockAlertTable for restricted user', () => {
      const onReceiveMock = jest.fn();
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <LowStockAlertTable onReceiveStockClick={onReceiveMock} />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Receive button must NOT be present
      expect(screen.queryByRole('button', { name: /Receive Stock/i })).not.toBeInTheDocument();
      // Details link remains accessible
      expect(screen.getByRole('link', { name: /Details/i })).toBeInTheDocument();
    });

    test('disables valuation queries and displays restricted state in InventoryOverviewSummary', () => {
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <InventoryOverviewSummary />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      expect(screen.getByText(/Financial Access Restricted/i)).toBeInTheDocument();
      // Verifies useInventoryValuation was called with enabled: false to prevent 403 API call
      expect(inventoryQueries.useInventoryValuation).toHaveBeenCalledWith({ enabled: false });
    });

    test('hides Commission New Asset button and valuation column in AssetsListPage', () => {
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/resources/assets']}>
            <AssetsListPage />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      expect(screen.queryByText(/Commission New Asset/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Valuation/i)).not.toBeInTheDocument();
    });

    test('hides mutation buttons in AssetDetailPage for restricted user', () => {
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/resources/assets/ast-201']}>
            <Routes>
              <Route path="/resources/assets/:id" element={<AssetDetailPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      expect(screen.queryByRole('button', { name: /Transfer/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Status/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Inspect/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Service/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Valuation/i })).not.toBeInTheDocument();
    });

    test('disables valuation summary query and renders restricted banner in AssetOverviewSummary', () => {
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <AssetOverviewSummary />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      expect(screen.getByTestId('valuation-restricted')).toBeInTheDocument();
      expect(assetQueries.useAssetValuationSummary).toHaveBeenCalledWith(undefined, {
        enabled: false,
      });
    });

    test('hides Record Work Order button on AssetMaintenancePage', () => {
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/resources/assets/ast-201/maintenance']}>
            <Routes>
              <Route path="/resources/assets/:id/maintenance" element={<AssetMaintenancePage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      expect(screen.queryByTestId('open-record-maintenance-btn')).not.toBeInTheDocument();
    });
  });

  describe('3. Disabled Contextual Actions for Terminal Lifecycle States', () => {
    beforeEach(() => {
      setupAuth(permittedUser);
      (assetQueries.useAsset as jest.Mock).mockReturnValue({
        data: mockRetiredAsset,
        isLoading: false,
        isFetching: false,
        isError: false,
        refetch: jest.fn(),
      });
    });

    test('disables mutation action buttons for retired asset in AssetDetailPage', () => {
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/resources/assets/ast-999']}>
            <Routes>
              <Route path="/resources/assets/:id" element={<AssetDetailPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Buttons are contextually visible because user has assets.write, but DISABLED due to RETIRED status
      const transferBtn = screen.getByRole('button', { name: /Transfer/i });
      const statusBtn = screen.getByRole('button', { name: /Status/i });
      const inspectBtn = screen.getByRole('button', { name: /Inspect/i });
      const serviceBtn = screen.getByRole('button', { name: /Service/i });
      const valuationBtn = screen.getByRole('button', { name: /Valuation/i });

      expect(transferBtn).toBeDisabled();
      expect(statusBtn).toBeDisabled();
      expect(inspectBtn).toBeDisabled();
      expect(serviceBtn).toBeDisabled();
      expect(valuationBtn).toBeDisabled();
    });
  });

  describe('4. URL Query Param Tamper Defense', () => {
    test('does not open receive modal dialog when restricted user manipulates ?action=receive', async () => {
      setupAuth(restrictedUser);

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/resources/inventory/prod-101?action=receive']}>
            <Routes>
              <Route path="/resources/inventory/:id" element={<InventoryDetailPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Dialog must NOT be mounted or visible
      expect(screen.queryByTestId('receive-stock-dialog')).not.toBeInTheDocument();
      expect(screen.queryByText(/Receive Inventory Batch/i)).not.toBeInTheDocument();
    });

    test('does not open scrap modal dialog when restricted user manipulates ?action=scrap', async () => {
      setupAuth(restrictedUser);

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/resources/inventory/prod-101?action=scrap']}>
            <Routes>
              <Route path="/resources/inventory/:id" element={<InventoryDetailPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      expect(screen.queryByTestId('scrap-stock-dialog')).not.toBeInTheDocument();
      expect(screen.queryByText(/Scrap Damaged Stock/i)).not.toBeInTheDocument();
    });

    test('does not open transfer modal dialog when restricted user manipulates ?action=transfer on asset', async () => {
      setupAuth(restrictedUser);

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/resources/assets/ast-201?action=transfer']}>
            <Routes>
              <Route path="/resources/assets/:id" element={<AssetDetailPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      expect(screen.queryByTestId('transfer-asset-dialog')).not.toBeInTheDocument();
    });
  });

  describe('5. Route Boundary Protection (RequirePermission)', () => {
    test('renders ForbiddenView and does not redirect to login when accessing inventory write route without permission', () => {
      setupAuth(restrictedUser);

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/resources/inventory/new']}>
            <Routes>
              <Route
                path="/resources/inventory/new"
                element={
                  <RequirePermission permission="inventory.write">
                    <div data-testid="secret-create-page">Secret Create Page</div>
                  </RequirePermission>
                }
              />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Gated content is NOT rendered
      expect(screen.queryByTestId('secret-create-page')).not.toBeInTheDocument();

      // ForbiddenView (403 Access Denied) is rendered
      expect(
        screen.getByText(/Access Denied: Missing required security claim/i),
      ).toBeInTheDocument();
      expect(screen.getByText(/inventory\.write/i)).toBeInTheDocument();
    });

    test('renders ForbiddenView when accessing asset write route without permission', () => {
      setupAuth(restrictedUser);

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/resources/assets/new']}>
            <Routes>
              <Route
                path="/resources/assets/new"
                element={
                  <RequirePermission permission="assets.write">
                    <div data-testid="secret-asset-page">Secret Asset Commission Page</div>
                  </RequirePermission>
                }
              />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      expect(screen.queryByTestId('secret-asset-page')).not.toBeInTheDocument();
      expect(
        screen.getByText(/Access Denied: Missing required security claim/i),
      ).toBeInTheDocument();
      expect(screen.getByText(/assets\.write/i)).toBeInTheDocument();
    });
  });

  describe('6. Unauthorized API Response Handling (Backend 403 Resilience)', () => {
    test('preserves user input and displays actionable error when backend rejects mutation with 403 Forbidden', async () => {
      setupAuth(permittedUser);

      // Simulating a backend 403 response on mutation (e.g. CSRF or revoked claim)
      const mockReceiveMutation = jest.fn((_vars, options) => {
        options?.onError?.(
          new Error('403 Forbidden: Missing required server-side claim inventory:write'),
        );
      });

      jest.spyOn(inventoryMutations, 'useReceiveStock').mockReturnValue({
        mutate: mockReceiveMutation,
        isPending: false,
      } as unknown as ReturnType<typeof inventoryMutations.useReceiveStock>);

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <ReceiveStockDialog product={mockProduct} open={true} onOpenChange={jest.fn()} />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Fill in form values
      const quantityInput = screen.getByLabelText(/Quantity Received/i);
      const unitCostInput = screen.getByLabelText(/Batch Unit Cost/i);
      const refInput = screen.getByLabelText(/PO \/ Invoice Reference/i);

      fireEvent.change(quantityInput, { target: { value: '25' } });
      fireEvent.change(unitCostInput, { target: { value: '22.50' } });
      fireEvent.change(refInput, { target: { value: 'PO-998877' } });

      // Submit form
      const submitBtn = screen.getByRole('button', { name: /Record Receipt/i });
      fireEvent.click(submitBtn);

      // Verify mutation was called and actionable error message is displayed
      await waitFor(() => {
        expect(mockReceiveMutation).toHaveBeenCalled();
        expect(
          screen.getByText(/403 Forbidden: Missing required server-side claim inventory:write/i),
        ).toBeInTheDocument();
      });

      // Crucial: Valid input was preserved and NOT wiped out
      expect(quantityInput).toHaveValue(25);
      expect(unitCostInput).toHaveValue(22.5);
      expect(refInput).toHaveValue('PO-998877');
    });
  });
});
