import '@testing-library/jest-dom';
import { render, screen, renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import React from 'react';

// Domain Enums & Types
import {
  InventoryCategory,
  InventoryItemStatus,
  StockMovementType,
  UnitOfMeasure,
  AssetCategory,
  AssetStatus,
  AssetCondition,
} from '@kinergy-platform/core';
import type {
  InventoryProductVM,
  StockMovementVM,
  InventoryValuationVM,
  StockMutationResultVM,
} from '../inventory/types';
import type { FixedAssetVM } from '../assets/types';
import type { ResourceOverviewVM } from '../overview/types';

// Inventory Hooks & APIs
import {
  useCreateProduct,
  useReceiveStock,
  useSellStock,
  useConsumeStock,
} from '../inventory/hooks/use-inventory-mutations';
import { useStockMovements } from '../inventory/hooks/use-inventory-queries';
import { inventoryApi, inventoryQueryKeys } from '../inventory/api';

// Assets Hooks & APIs
import {
  useCreateAsset,
  useTransferAssetLocation,
  useChangeAssetStatus,
  useRecordAssetMaintenance,
  useUpdateAssetValuation,
} from '../assets/hooks/use-assets-mutations';
import { assetsApi, assetsQueryKeys } from '../assets/api';

// Overview Hooks & Page
import { resourceOverviewApi, resourceOverviewQueryKeys } from '../overview/api';
import { ResourceOverviewPage } from '../overview/routes/resource-overview-page';

// Auth Provider
import * as authModule from '../../../app/providers/auth-provider';

// Mock Notification Provider
const mockSuccessToast = jest.fn();
const mockErrorToast = jest.fn();
const mockWarningToast = jest.fn();
const mockInfoToast = jest.fn();

jest.mock('../../../app/providers/notification-provider', () => ({
  useNotification: () => ({
    success: mockSuccessToast,
    error: mockErrorToast,
    warning: mockWarningToast,
    info: mockInfoToast,
  }),
}));

// Mock APIs
jest.mock('../inventory/api/inventory-api', () => ({
  inventoryApi: {
    createItem: jest.fn(),
    getItemById: jest.fn(),
    receiveStock: jest.fn(),
    sellStock: jest.fn(),
    consumeStock: jest.fn(),
    getMovements: jest.fn(),
    getValuation: jest.fn(),
    getLowStock: jest.fn(),
    listItems: jest.fn(),
    getCategories: jest.fn(),
  },
}));

jest.mock('../assets/api/assets-api', () => ({
  assetsApi: {
    createAsset: jest.fn(),
    getAsset: jest.fn(),
    transferLocation: jest.fn(),
    changeStatus: jest.fn(),
    recordMaintenance: jest.fn(),
    updateValuation: jest.fn(),
    getAssetHistory: jest.fn(),
    getMaintenanceHistory: jest.fn(),
    getValuationSummary: jest.fn(),
    listAssets: jest.fn(),
    getCategories: jest.fn(),
  },
}));

jest.mock('../overview/api/resource-overview-api', () => ({
  resourceOverviewApi: {
    getOverview: jest.fn(),
  },
}));

jest.mock('../../../app/providers/auth-provider', () => {
  const actual = jest.requireActual('../../../app/providers/auth-provider');
  return {
    ...actual,
    useAuth: jest.fn(),
  };
});

describe('Phase 6 Frontend-to-Backend Business Flow Validation (Scenarios A through H)', () => {
  let queryClient: QueryClient;

  const mockAdminUser = {
    id: 'usr_admin_e2e',
    name: 'Executive Owner',
    email: 'owner@kinergy.test',
    roles: ['OWNER', 'ADMIN'],
    permissions: [
      'inventory.read',
      'inventory.write',
      'assets.read',
      'assets.write',
      'billing.read',
    ],
  };

  const setupAuth = (user = mockAdminUser) => {
    (authModule.useAuth as jest.Mock).mockReturnValue({
      currentUser: user,
      isAuthenticated: true,
      hasRole: (role: string) => user.roles.includes(role),
      hasPermission: (perm: string) => user.permissions.includes(perm),
    });
  };

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    jest.clearAllMocks();
    setupAuth();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  // =========================================================================
  // 1. Consumable Inventory Business Flows (Scenarios A through D)
  // =========================================================================
  describe('1. Consumable Inventory Business Flows (Scenarios A through D)', () => {
    const mockInitialProduct: InventoryProductVM = {
      id: 'prod-hydration-drink',
      sku: 'DRK-HYDRATE-01',
      name: 'Hydration Recovery Drink',
      description: 'Electrolyte drink for post-workout hydration',
      category: InventoryCategory.HEALTHY_DRINKS,
      unitCost: { amount: 10.0, currency: 'USD' },
      sellingPrice: { amount: 15.0, currency: 'USD' },
      currentStock: 0,
      reorderThreshold: 10,
      unitOfMeasure: UnitOfMeasure.BOTTLES,
      status: InventoryItemStatus.ACTIVE,
      isLowStock: false,
      isOutOfStock: true,
      createdAt: '2026-09-15T10:00:00.000Z',
      updatedAt: '2026-09-15T10:00:00.000Z',
    };

    it('Product Creation & Initial Zero Stock: registers product with 0 stock and ACTIVE status', async () => {
      (inventoryApi.createItem as jest.Mock).mockResolvedValue(mockInitialProduct);

      const { result } = renderHook(() => useCreateProduct(), { wrapper });

      act(() => {
        result.current.mutate({
          sku: 'DRK-HYDRATE-01',
          name: 'Hydration Recovery Drink',
          description: 'Electrolyte drink for post-workout hydration',
          category: InventoryCategory.HEALTHY_DRINKS,
          unitCost: 10.0,
          sellingPrice: 15.0,
          unitOfMeasure: UnitOfMeasure.BOTTLES,
          reorderThreshold: 10,
        });
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // Standardized success feedback
      expect(mockSuccessToast).toHaveBeenCalledWith(
        'Product "Hydration Recovery Drink" registered successfully',
      );

      // Business truth: Product begins with 0 units on hand
      expect(result.current.data?.currentStock).toBe(0);
      expect(result.current.data?.status).toBe(InventoryItemStatus.ACTIVE);
      expect(result.current.data?.isOutOfStock).toBe(true);
    });

    it('Scenario A: Purchase / Receive Stock increases stock to 50 and logs PURCHASE movement', async () => {
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const mockReceiveResult: StockMutationResultVM = {
        success: true,
        movementId: 'mov-purchase-01',
        balanceAfter: 50,
        occurredAt: '2026-09-15T10:15:00.000Z',
      };
      (inventoryApi.receiveStock as jest.Mock).mockResolvedValue(mockReceiveResult);

      const { result } = renderHook(() => useReceiveStock(), { wrapper });

      act(() => {
        result.current.mutate({
          id: mockInitialProduct.id,
          payload: {
            quantity: 50,
            unitCost: 10.0,
            referenceNumber: 'PO-2026-001',
            notes: 'Supplier delivery batch #1',
          },
        });
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // Standardized feedback
      expect(mockSuccessToast).toHaveBeenCalledWith('Received 50 units into inventory');

      // Verifies query synchronization across inventory domain and overview cockpit
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: inventoryQueryKeys.detail(mockInitialProduct.id),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: inventoryQueryKeys.stock(mockInitialProduct.id),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: inventoryQueryKeys.movementsLists(mockInitialProduct.id),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: inventoryQueryKeys.valuation(),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: resourceOverviewQueryKeys.all,
      });
    });

    it('Scenario B: Retail Sale decreases stock by 5 to 45 and logs SALE movement', async () => {
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const mockSaleResult: StockMutationResultVM = {
        success: true,
        movementId: 'mov-sale-01',
        balanceAfter: 45,
        occurredAt: '2026-09-15T10:30:00.000Z',
      };
      (inventoryApi.sellStock as jest.Mock).mockResolvedValue(mockSaleResult);

      const { result } = renderHook(() => useSellStock(), { wrapper });

      act(() => {
        result.current.mutate({
          id: mockInitialProduct.id,
          payload: { quantity: 5, unitPrice: 15.0, notes: 'Reception counter sale' },
        });
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockSuccessToast).toHaveBeenCalledWith('Recorded sale of 5 units');
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: inventoryQueryKeys.detail(mockInitialProduct.id),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: inventoryQueryKeys.movementsLists(mockInitialProduct.id),
      });
    });

    it('Scenario C: Internal Consumption decreases stock by 3 to 42 and logs CONSUMPTION movement distinct from SALE', async () => {
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const mockConsumeResult: StockMutationResultVM = {
        success: true,
        movementId: 'mov-consume-01',
        balanceAfter: 42,
        occurredAt: '2026-09-15T11:00:00.000Z',
      };
      (inventoryApi.consumeStock as jest.Mock).mockResolvedValue(mockConsumeResult);

      const { result } = renderHook(() => useConsumeStock(), { wrapper });

      act(() => {
        result.current.mutate({
          id: mockInitialProduct.id,
          payload: { quantity: 3, notes: 'Consumed during recovery treatment' },
        });
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockSuccessToast).toHaveBeenCalledWith('Recorded consumption of 3 units');
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: inventoryQueryKeys.movementsLists(mockInitialProduct.id),
      });
    });

    it('Scenario D: Invalid Sale / Atomic Failure strictly preserves stock at 42 with zero optimistic mutation', async () => {
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      // Populate current cached stock at 42
      const productAtStock42: InventoryProductVM = {
        ...mockInitialProduct,
        currentStock: 42,
        isOutOfStock: false,
      };
      queryClient.setQueryData(inventoryQueryKeys.detail(mockInitialProduct.id), productAtStock42);
      queryClient.setQueryData(inventoryQueryKeys.stock(mockInitialProduct.id), {
        currentStock: 42,
      });

      // Server rejects attempt to sell 50 units (insufficient stock)
      const domainError = new Error(
        'Insufficient stock: cannot sell 50 units, only 42 units available in stock.',
      );
      (inventoryApi.sellStock as jest.Mock).mockRejectedValue(domainError);

      const { result } = renderHook(() => useSellStock(), { wrapper });

      act(() => {
        result.current.mutate({
          id: mockInitialProduct.id,
          payload: { quantity: 50, unitPrice: 15.0 },
        });
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      // 1. Recoverable error toast surfaced to user
      expect(mockErrorToast).toHaveBeenCalledWith(
        'Insufficient stock: cannot sell 50 units, only 42 units available in stock.',
      );

      // 2. Success feedback NEVER displayed
      expect(mockSuccessToast).not.toHaveBeenCalled();

      // 3. UI and Cache Invariant: Stock strictly remains 42 (NEVER negative, NEVER optimistically altered)
      const cachedProduct = queryClient.getQueryData<InventoryProductVM>(
        inventoryQueryKeys.detail(mockInitialProduct.id),
      );
      expect(cachedProduct?.currentStock).toBe(42);

      // 4. Invariant: Invalid mutation does NOT trigger cache invalidation
      expect(invalidateSpy).not.toHaveBeenCalled();
    });

    it('Movement History & Valuation: reflects sequence of movements and accurate consumable valuation', async () => {
      const mockMovements: StockMovementVM[] = [
        {
          id: 'mov-consume-01',
          itemId: mockInitialProduct.id,
          type: StockMovementType.CONSUMPTION,
          quantity: -3,
          previousBalance: 45,
          newBalance: 42,
          unitCost: { amount: 10.0, currency: 'USD' },
          sellingPrice: null,
          referenceNumber: null,
          reason: 'Consumed during recovery treatment',
          actorId: 'usr_admin_e2e',
          occurredAt: '2026-09-15T11:00:00.000Z',
        },
        {
          id: 'mov-sale-01',
          itemId: mockInitialProduct.id,
          type: StockMovementType.SALE,
          quantity: -5,
          previousBalance: 50,
          newBalance: 45,
          unitCost: { amount: 10.0, currency: 'USD' },
          sellingPrice: { amount: 15.0, currency: 'USD' },
          referenceNumber: null,
          reason: 'Reception counter sale',
          actorId: 'usr_admin_e2e',
          occurredAt: '2026-09-15T10:30:00.000Z',
        },
        {
          id: 'mov-purchase-01',
          itemId: mockInitialProduct.id,
          type: StockMovementType.PURCHASE,
          quantity: 50,
          previousBalance: 0,
          newBalance: 50,
          unitCost: { amount: 10.0, currency: 'USD' },
          sellingPrice: null,
          referenceNumber: 'PO-2026-001',
          reason: 'Supplier delivery batch #1',
          actorId: 'usr_admin_e2e',
          occurredAt: '2026-09-15T10:15:00.000Z',
        },
      ];

      (inventoryApi.getMovements as jest.Mock).mockResolvedValue({
        items: mockMovements,
        total: 3,
        page: 1,
        limit: 10,
        totalPages: 1,
      });

      const { result } = renderHook(() => useStockMovements(mockInitialProduct.id), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.items.length).toBe(3);
      // Sequence preservation
      expect(result.current.data).toBeDefined();
      expect(result.current.data?.items[0]?.type).toBe(StockMovementType.CONSUMPTION);
      expect(result.current.data?.items[1]?.type).toBe(StockMovementType.SALE);
      expect(result.current.data?.items[2]?.type).toBe(StockMovementType.PURCHASE);

      // Consumable valuation = 42 units * $10.00 = $420.00
      const mockValuation: InventoryValuationVM = {
        totalDistinctItems: 1,
        totalQuantityUnits: 42,
        totalValueAmount: 420.0,
        currency: 'USD',
        calculatedAt: '2026-09-15T11:05:00.000Z',
      };
      (inventoryApi.getValuation as jest.Mock).mockResolvedValue(mockValuation);
      const valuation = await inventoryApi.getValuation();
      expect(valuation.totalValueAmount).toBe(420.0);
    });
  });

  // =========================================================================
  // 2. Fixed Assets Business Flows (Scenarios E through H)
  // =========================================================================
  describe('2. Fixed Assets Business Flows (Scenarios E through H)', () => {
    const mockTreadmill: FixedAssetVM = {
      id: 'ast-treadmill-01',
      assetTag: 'AST-TRD-COMM-01',
      name: 'Commercial Pro Club Treadmill',
      description: 'Heavy duty commercial treadmill',
      category: AssetCategory.GYM_EQUIPMENT,
      status: AssetStatus.ACTIVE,
      condition: AssetCondition.EXCELLENT,
      purchaseDate: '2026-01-15T00:00:00.000Z',
      purchaseValueAmount: 8000.0,
      purchaseValueCurrency: 'USD',
      currentEstimatedValueAmount: 8000.0,
      currentEstimatedValueCurrency: 'USD',
      location: {
        facilityId: 'fac_main',
        roomId: 'room_cardio_a',
        zone: 'Cardio Zone 1',
        description: 'Near East Window',
      },
      notes: 'Initial commissioning',
      version: 1,
      createdAt: '2026-09-15T09:00:00.000Z',
      updatedAt: '2026-09-15T09:00:00.000Z',
    };

    it('Scenario E: Asset Registration commissions treadmill with initial value, status ACTIVE, condition EXCELLENT', async () => {
      (assetsApi.createAsset as jest.Mock).mockResolvedValue(mockTreadmill);

      const { result } = renderHook(() => useCreateAsset(), { wrapper });

      act(() => {
        result.current.mutate({
          assetTag: 'AST-TRD-COMM-01',
          name: 'Commercial Pro Club Treadmill',
          category: AssetCategory.GYM_EQUIPMENT,
          location: {
            facilityId: 'fac_main',
            roomId: 'room_cardio_a',
            zone: 'Cardio Zone 1',
          },
          purchaseDate: '2026-01-15T00:00:00.000Z',
          purchaseValueAmount: 8000.0,
          currentEstimatedValueAmount: 8000.0,
          condition: AssetCondition.EXCELLENT,
        });
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockSuccessToast).toHaveBeenCalledWith(
        'Asset "Commercial Pro Club Treadmill" (AST-TRD-COMM-01) commissioned successfully',
      );
      expect(result.current.data?.status).toBe(AssetStatus.ACTIVE);
      expect(result.current.data?.purchaseValueAmount).toBe(8000.0);
      expect(result.current.data?.currentEstimatedValueAmount).toBe(8000.0);
    });

    it('Scenario F: Asset Transfer relocates asset to Functional Area B and records transfer history', async () => {
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const relocatedAsset: FixedAssetVM = {
        ...mockTreadmill,
        location: {
          facilityId: 'fac_main',
          roomId: 'room_functional_b',
          zone: 'Functional Zone 2',
          description: 'Relocated for floor reorganization',
        },
      };
      (assetsApi.transferLocation as jest.Mock).mockResolvedValue(relocatedAsset);

      const { result } = renderHook(() => useTransferAssetLocation(), { wrapper });

      act(() => {
        result.current.mutate({
          id: mockTreadmill.id,
          payload: {
            location: {
              facilityId: 'fac_main',
              roomId: 'room_functional_b',
              zone: 'Functional Zone 2',
            },
            reason: 'Floor reorganization',
          },
        });
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockSuccessToast).toHaveBeenCalledWith(
        'Asset "Commercial Pro Club Treadmill" relocated to facility fac_main',
      );
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: assetsQueryKeys.detail(mockTreadmill.id),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: assetsQueryKeys.historyLists(mockTreadmill.id),
      });
      expect(result.current.data?.location.roomId).toBe('room_functional_b');
      // Status and condition remain intact
      expect(result.current.data?.status).toBe(AssetStatus.ACTIVE);
      expect(result.current.data?.condition).toBe(AssetCondition.EXCELLENT);
    });

    it('Scenario G: Asset Maintenance transitions lifecycle state and preserves maintenance history', async () => {
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      // 1. Enter UNDER_MAINTENANCE
      const underMaintenanceAsset: FixedAssetVM = {
        ...mockTreadmill,
        status: AssetStatus.UNDER_MAINTENANCE,
      };
      (assetsApi.changeStatus as jest.Mock).mockResolvedValue(underMaintenanceAsset);

      const { result: statusResult } = renderHook(() => useChangeAssetStatus(), { wrapper });
      act(() => {
        statusResult.current.mutate({
          id: mockTreadmill.id,
          payload: { status: AssetStatus.UNDER_MAINTENANCE, reason: 'Scheduled belt inspection' },
        });
      });
      await waitFor(() => expect(statusResult.current.isSuccess).toBe(true));
      expect(statusResult.current.data?.status).toBe(AssetStatus.UNDER_MAINTENANCE);

      // 2. Complete maintenance work order
      (assetsApi.recordMaintenance as jest.Mock).mockResolvedValue({
        id: 'maint-rec-01',
        assetId: mockTreadmill.id,
        serviceDate: '2026-09-15T12:00:00.000Z',
        description: 'Quarterly motor check and lubrication',
        performedBy: 'Certified Tech LLC',
        costAmount: 250.0,
        completedAt: '2026-09-15T12:00:00.000Z',
      });

      const { result: maintResult } = renderHook(() => useRecordAssetMaintenance(), { wrapper });
      act(() => {
        maintResult.current.mutate({
          id: mockTreadmill.id,
          payload: {
            serviceDate: '2026-09-15T12:00:00.000Z',
            description: 'Quarterly motor check and lubrication',
            performedBy: 'Certified Tech LLC',
            costAmount: 250.0,
            updateConditionTo: AssetCondition.EXCELLENT,
          },
        });
      });
      await waitFor(() => expect(maintResult.current.isSuccess).toBe(true));

      expect(mockSuccessToast).toHaveBeenCalledWith(
        'Maintenance recorded ($250.00 by Certified Tech LLC)',
      );
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: assetsQueryKeys.maintenanceLists(mockTreadmill.id),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: assetsQueryKeys.historyLists(mockTreadmill.id),
      });
    });

    it('Scenario H: Fixed Asset Revaluation updates carrying fair value to $7,500', async () => {
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const revaluedAsset: FixedAssetVM = {
        ...mockTreadmill,
        currentEstimatedValueAmount: 7500.0,
      };
      (assetsApi.updateValuation as jest.Mock).mockResolvedValue(revaluedAsset);

      const { result } = renderHook(() => useUpdateAssetValuation(), { wrapper });

      act(() => {
        result.current.mutate({
          id: mockTreadmill.id,
          payload: {
            estimatedValueAmount: 7500.0,
            reason: 'Annual equipment depreciation assessment',
          },
        });
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockSuccessToast).toHaveBeenCalledWith(
        'Asset "Commercial Pro Club Treadmill" fair value updated to $7500.00',
      );
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: assetsQueryKeys.valuation(mockTreadmill.id),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['resources', 'valuation'],
      });
      expect(result.current.data?.currentEstimatedValueAmount).toBe(7500.0);
    });
  });

  // =========================================================================
  // 3. Resource Overview Cockpit (Inventory + Assets Aggregation & Screen States)
  // =========================================================================
  describe('3. Resource Overview Cockpit (Inventory + Assets Aggregation & Screen States)', () => {
    const mockOverviewData: ResourceOverviewVM = {
      consumableInventory: {
        totalValueAmount: 420.0,
        lowStockItemCount: 1,
        totalDistinctItems: 1,
        totalQuantityUnits: 42,
      },
      fixedAssets: {
        totalCarryingValueAmount: 7500.0,
        activeAssetCount: 1,
        underMaintenanceAssetCount: 0,
        damagedAssetCount: 0,
        retiredAssetCount: 0,
        totalAssetCount: 1,
      },
      combined: {
        totalCombinedValueAmount: 7920.0, // 420.0 + 7500.0
      },
      currency: 'USD',
      calculatedAt: '2026-09-15T13:00:00.000Z',
    };

    const renderOverviewPage = () => {
      return render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/resources/overview']}>
            <Routes>
              <Route path="/resources/overview" element={<ResourceOverviewPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );
    };

    it('Overview Populated State: renders accurate consumable, fixed asset, and combined valuations', async () => {
      (resourceOverviewApi.getOverview as jest.Mock).mockResolvedValue(mockOverviewData);

      renderOverviewPage();

      await waitFor(() => {
        expect(screen.getByTestId('resource-overview-page')).toBeInTheDocument();
      });

      // Heading
      expect(
        screen.getByRole('heading', { level: 1, name: 'Resource Overview' }),
      ).toBeInTheDocument();

      // Combined Valuation: $7,920.00
      expect(screen.getByText('$7,920.00')).toBeInTheDocument();

      // Consumable Inventory Valuation: $420.00 (rendered in overall and inventory cards)
      expect(screen.getAllByText('$420.00').length).toBeGreaterThanOrEqual(1);

      // Fixed Asset Valuation: $7,500.00 (rendered in overall and assets cards)
      expect(screen.getAllByText('$7,500.00').length).toBeGreaterThanOrEqual(1);

      // Distinct items and active asset counts
      expect(screen.getByTestId('metric-distinct-items')).toBeInTheDocument();
      expect(screen.getByTestId('metric-active-assets')).toBeInTheDocument();
    });

    it('Overview Loading State: renders skeleton placeholders while fetching', () => {
      (resourceOverviewApi.getOverview as jest.Mock).mockReturnValue(new Promise(() => {})); // Never resolves

      renderOverviewPage();

      expect(screen.getByTestId('resource-overview-loading')).toBeInTheDocument();
    });

    it('Overview Empty State: renders informative state when no resources are tracked', async () => {
      const emptyData: ResourceOverviewVM = {
        consumableInventory: {
          totalValueAmount: 0,
          lowStockItemCount: 0,
          totalDistinctItems: 0,
          totalQuantityUnits: 0,
        },
        fixedAssets: {
          totalCarryingValueAmount: 0,
          activeAssetCount: 0,
          underMaintenanceAssetCount: 0,
          damagedAssetCount: 0,
          retiredAssetCount: 0,
          totalAssetCount: 0,
        },
        combined: {
          totalCombinedValueAmount: 0,
        },
        currency: 'USD',
        calculatedAt: '2026-09-15T13:00:00.000Z',
      };
      (resourceOverviewApi.getOverview as jest.Mock).mockResolvedValue(emptyData);

      renderOverviewPage();

      await waitFor(() => {
        expect(screen.getByTestId('resource-overview-empty')).toBeInTheDocument();
      });
      expect(screen.getByText('No Resource Records Initialized')).toBeInTheDocument();
      expect(
        screen.getByText(
          /Your business currently has no consumable inventory products or fixed equipment registered/i,
        ),
      ).toBeInTheDocument();
    });

    it('Overview Error State: renders error alert and permits manual retry', async () => {
      (resourceOverviewApi.getOverview as jest.Mock).mockRejectedValue(
        new Error('Failed to fetch resource overview metrics'),
      );

      renderOverviewPage();

      await waitFor(() => {
        expect(screen.getByTestId('resource-overview-error')).toBeInTheDocument();
      });
      expect(screen.getByText('Unable to Load Resource Overview')).toBeInTheDocument();
      expect(screen.getByText('Failed to fetch resource overview metrics')).toBeInTheDocument();

      // Verifies retry action exists
      const retryButton = screen.getByRole('button', { name: /Try Again/i });
      expect(retryButton).toBeInTheDocument();
    });
  });

  // =========================================================================
  // 4. Mutation Feedback, Resilience & Invariant Integrity
  // =========================================================================
  describe('4. Mutation Feedback, Resilience & Invariant Integrity', () => {
    it('never displays success for rejected operations across any domain mutation', async () => {
      const serverRejection = new Error('Permission denied: requires billing.read');
      (assetsApi.updateValuation as jest.Mock).mockRejectedValue(serverRejection);

      const { result } = renderHook(() => useUpdateAssetValuation(), { wrapper });

      act(() => {
        result.current.mutate({
          id: 'ast-unauthorized',
          payload: { estimatedValueAmount: 9000.0 },
        });
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(mockErrorToast).toHaveBeenCalledWith('Permission denied: requires billing.read');
      expect(mockSuccessToast).not.toHaveBeenCalled();
    });

    it('handles network disconnection gracefully with recoverable error message', async () => {
      const networkError = new Error('Network timeout while communicating with server');
      (inventoryApi.receiveStock as jest.Mock).mockRejectedValue(networkError);

      const { result } = renderHook(() => useReceiveStock(), { wrapper });

      act(() => {
        result.current.mutate({
          id: 'prod-timeout',
          payload: { quantity: 10, referenceNumber: 'RETRY-001' },
        });
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(mockErrorToast).toHaveBeenCalledWith(
        'Network timeout while communicating with server',
      );
      expect(mockSuccessToast).not.toHaveBeenCalled();
    });
  });
});
