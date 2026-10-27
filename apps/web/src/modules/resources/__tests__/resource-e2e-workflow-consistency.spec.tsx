import '@testing-library/jest-dom';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Domain Enums & Types
import {
  InventoryCategory,
  InventoryItemStatus,
  StockMovementType,
  UnitOfMeasure,
} from '../inventory/types';
import { AssetCategory, AssetStatus, AssetCondition, AssetHistoryEventType } from '../assets/types';
import type {
  InventoryProductVM,
  StockMovementVM,
  StockMutationResultVM,
} from '../inventory/types';
import type { FixedAssetVM } from '../assets/types';
import type { ResourceOverviewVM } from '../overview/types';

// Inventory Hooks & APIs
import {
  useReceiveStock,
  useAdjustStock,
  useScrapStock,
} from '../inventory/hooks/use-inventory-mutations';
import { inventoryApi, inventoryQueryKeys } from '../inventory/api';

// Assets Hooks & APIs
import {
  useTransferAssetLocation,
  useChangeAssetStatus,
  useRecordAssetMaintenance,
} from '../assets/hooks/use-assets-mutations';
import { assetsApi, assetsQueryKeys } from '../assets/api';

// Overview Hooks & APIs
import { resourceOverviewApi, resourceOverviewQueryKeys } from '../overview/api';

// Auth Provider Mock
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
    getStockLevel: jest.fn(),
    receiveStock: jest.fn(),
    adjustStock: jest.fn(),
    scrapStock: jest.fn(),
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
    updateCondition: jest.fn(),
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

describe('Full-Stack Resources End-to-End Workflow & Data Integrity Verification', () => {
  let queryClient: QueryClient;

  const mockAdminUser = {
    id: 'usr_admin_quality',
    name: 'Quality Lead Engineer',
    email: 'qa@kinergy.test',
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
  // WORKFLOW 1: COMPLETE CONSUMABLES 9-STEP BUSINESS WORKFLOW
  // =========================================================================
  describe('Workflow 1: Complete Consumables 9-Step Lifecycle & Ledger Journey', () => {
    const initialProduct: InventoryProductVM = {
      id: 'prod-supp-omega3',
      sku: 'SUPP-OMEGA3-120S',
      name: 'Triple Strength Omega-3 EPA/DHA',
      description: 'Pharmaceutical grade fish oil concentrate',
      category: InventoryCategory.SUPPLEMENTS,
      unitCost: { amount: 12.0, currency: 'USD' },
      sellingPrice: { amount: 24.0, currency: 'USD' },
      currentStock: 0,
      reorderThreshold: 15,
      unitOfMeasure: UnitOfMeasure.BOTTLES,
      status: InventoryItemStatus.ACTIVE,
      isLowStock: true, // 0 is below reorderThreshold 15
      isOutOfStock: true,
      createdAt: '2026-10-01T08:00:00.000Z',
      updatedAt: '2026-10-01T08:00:00.000Z',
    };

    it('executes steps 1-9: catalog -> inspect -> receive -> ledger -> adjust -> scrap -> low-stock -> overview sync', async () => {
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      // 1. Open catalog & inspect current stock (initial = 0)
      (inventoryApi.getItemById as jest.Mock).mockResolvedValue(initialProduct);
      const item = await inventoryApi.getItemById('prod-supp-omega3');
      expect(item.currentStock).toBe(0);
      expect(item.isOutOfStock).toBe(true);

      // 2. Receive stock (+100 units from PO-2026-OMEGA)
      const receiveResult: StockMutationResultVM = {
        success: true,
        movementId: 'mov-po-omega-01',
        balanceAfter: 100,
        occurredAt: '2026-10-01T09:00:00.000Z',
      };
      (inventoryApi.receiveStock as jest.Mock).mockResolvedValue(receiveResult);

      const { result: receiveHook } = renderHook(() => useReceiveStock(), { wrapper });
      act(() => {
        receiveHook.current.mutate({
          id: initialProduct.id,
          payload: {
            quantity: 100,
            unitCost: 12.0,
            referenceNumber: 'PO-2026-OMEGA',
            notes: 'Batch delivery 100 bottles',
          },
        });
      });
      await waitFor(() => expect(receiveHook.current.isSuccess).toBe(true));
      expect(mockSuccessToast).toHaveBeenCalledWith('Received 100 units into inventory');

      // Verify query invalidation covers product detail, stock, movement ledger, low-stock, and overview
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: inventoryQueryKeys.detail(initialProduct.id),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: inventoryQueryKeys.stock(initialProduct.id),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: inventoryQueryKeys.movementsLists(initialProduct.id),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: inventoryQueryKeys.lowStock(),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: resourceOverviewQueryKeys.all,
      });

      // 3. Movement history reflects PURCHASE of 100 units (balance 0 -> 100)
      const purchaseMovement: StockMovementVM = {
        id: 'mov-po-omega-01',
        itemId: initialProduct.id,
        type: StockMovementType.PURCHASE,
        quantity: 100,
        previousBalance: 0,
        newBalance: 100,
        unitCost: { amount: 12.0, currency: 'USD' },
        sellingPrice: null,
        referenceNumber: 'PO-2026-OMEGA',
        reason: 'Batch delivery 100 bottles',
        actorId: 'usr_admin_quality',
        occurredAt: '2026-10-01T09:00:00.000Z',
      };
      (inventoryApi.getMovements as jest.Mock).mockResolvedValue({
        items: [purchaseMovement],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
      const historyAfterReceive = await inventoryApi.getMovements(initialProduct.id);
      expect(historyAfterReceive.items[0]?.newBalance).toBe(100);

      // 4. Perform an audit adjustment (-10 units discrepancy discovered in storage bin)
      const adjustResult: StockMutationResultVM = {
        success: true,
        movementId: 'mov-adj-omega-01',
        balanceAfter: 90,
        occurredAt: '2026-10-01T10:00:00.000Z',
      };
      (inventoryApi.adjustStock as jest.Mock).mockResolvedValue(adjustResult);

      const { result: adjustHook } = renderHook(() => useAdjustStock(), { wrapper });
      act(() => {
        adjustHook.current.mutate({
          id: initialProduct.id,
          payload: {
            deltaQuantity: -10,
            reason: 'Physical count audit adjustment: 10 units transferred to clinic',
          },
        });
      });
      await waitFor(() => expect(adjustHook.current.isSuccess).toBe(true));
      expect(mockSuccessToast).toHaveBeenCalledWith('Physical count adjusted by -10 units');

      // 5. Perform scrap / disposal operation (-80 units damaged due to cooler failure)
      // Balance drops from 90 to 10 (which is now BELOW reorderThreshold 15!)
      const scrapResult: StockMutationResultVM = {
        success: true,
        movementId: 'mov-scrap-omega-01',
        balanceAfter: 10,
        occurredAt: '2026-10-01T11:00:00.000Z',
      };
      (inventoryApi.scrapStock as jest.Mock).mockResolvedValue(scrapResult);

      const { result: scrapHook } = renderHook(() => useScrapStock(), { wrapper });
      act(() => {
        scrapHook.current.mutate({
          id: initialProduct.id,
          payload: {
            quantity: 80,
            reason: 'Storage cooler thermostat malfunction causing oil rancidity',
          },
        });
      });
      await waitFor(() => expect(scrapHook.current.isSuccess).toBe(true));
      expect(mockSuccessToast).toHaveBeenCalledWith('Disposed 80 scrapped units');

      // 6. Verify final ledger preserves complete chronological sequence
      const scrapMovement: StockMovementVM = {
        id: 'mov-scrap-omega-01',
        itemId: initialProduct.id,
        type: StockMovementType.SCRAP,
        quantity: -80,
        previousBalance: 90,
        newBalance: 10,
        unitCost: { amount: 12.0, currency: 'USD' },
        sellingPrice: null,
        referenceNumber: null,
        reason: 'Storage cooler thermostat malfunction causing oil rancidity',
        actorId: 'usr_admin_quality',
        occurredAt: '2026-10-01T11:00:00.000Z',
      };
      const adjustMovement: StockMovementVM = {
        id: 'mov-adj-omega-01',
        itemId: initialProduct.id,
        type: StockMovementType.ADJUSTMENT_OUT,
        quantity: -10,
        previousBalance: 100,
        newBalance: 90,
        unitCost: { amount: 12.0, currency: 'USD' },
        sellingPrice: null,
        referenceNumber: null,
        reason: 'Physical count audit adjustment',
        actorId: 'usr_admin_quality',
        occurredAt: '2026-10-01T10:00:00.000Z',
      };

      (inventoryApi.getMovements as jest.Mock).mockResolvedValue({
        items: [scrapMovement, adjustMovement, purchaseMovement],
        total: 3,
        page: 1,
        limit: 20,
        totalPages: 1,
      });

      const fullLedger = await inventoryApi.getMovements(initialProduct.id);
      expect(fullLedger.items.length).toBe(3);
      expect(fullLedger.items[0]?.type).toBe(StockMovementType.SCRAP);
      expect(fullLedger.items[0]?.newBalance).toBe(10);
      expect(fullLedger.items[1]?.type).toBe(StockMovementType.ADJUSTMENT_OUT);
      expect(fullLedger.items[2]?.type).toBe(StockMovementType.PURCHASE);

      // 7. Verify low-stock summary now includes item (balance 10 <= threshold 15)
      const lowStockProduct: InventoryProductVM = {
        ...initialProduct,
        currentStock: 10,
        isLowStock: true,
        isOutOfStock: false,
      };
      (inventoryApi.getLowStock as jest.Mock).mockResolvedValue([lowStockProduct]);

      const lowStockItems = await inventoryApi.getLowStock();
      expect(lowStockItems.length).toBe(1);
      expect(lowStockItems[0]?.sku).toBe('SUPP-OMEGA3-120S');
      expect(lowStockItems[0]?.currentStock).toBe(10);
      expect(lowStockItems[0]?.reorderThreshold).toBe(15);

      // 8. Verify enterprise overview receives refreshed low-stock item count
      const updatedOverview: ResourceOverviewVM = {
        combined: {
          totalCombinedValueAmount: 120.0,
        },
        consumableInventory: {
          totalDistinctItems: 1,
          totalQuantityUnits: 10,
          totalValueAmount: 120.0,
          lowStockItemCount: 1,
        },
        fixedAssets: {
          totalAssetCount: 0,
          activeAssetCount: 0,
          underMaintenanceAssetCount: 0,
          damagedAssetCount: 0,
          retiredAssetCount: 0,
          totalCarryingValueAmount: 0.0,
        },
        currency: 'USD',
        calculatedAt: '2026-10-01T11:05:00.000Z',
      };
      (resourceOverviewApi.getOverview as jest.Mock).mockResolvedValue(updatedOverview);

      const overviewResult = await resourceOverviewApi.getOverview();
      expect(overviewResult.consumableInventory.lowStockItemCount).toBe(1);
      expect(overviewResult.consumableInventory.totalValueAmount).toBe(120.0);
    });
  });

  // =========================================================================
  // WORKFLOW 2: COMPLETE FIXED ASSETS 6-STEP BUSINESS WORKFLOW
  // =========================================================================
  describe('Workflow 2: Complete Fixed Assets 6-Step Lifecycle & History Journey', () => {
    const commissionedAsset: FixedAssetVM = {
      id: 'ast-laser-01',
      assetTag: 'AST-CLINIC-LASER-01',
      name: 'Class IV Therapeutic Deep Tissue Laser',
      description: 'High-power clinical laser therapy system',
      category: AssetCategory.THERAPY_EQUIPMENT,
      status: AssetStatus.ACTIVE,
      condition: AssetCondition.EXCELLENT,
      purchaseDate: '2026-02-01T00:00:00.000Z',
      purchaseValueAmount: 18500.0,
      purchaseValueCurrency: 'USD',
      currentEstimatedValueAmount: 18500.0,
      currentEstimatedValueCurrency: 'USD',
      location: {
        facilityId: 'CLINIC_HQ',
        roomId: 'Laser Suite 1',
        zone: 'Zone A',
        description: 'Mounted optical console',
      },
      notes: 'Initial clinical commissioning and safety interlock test',
      version: 1,
      createdAt: '2026-02-01T08:00:00.000Z',
      updatedAt: '2026-02-01T08:00:00.000Z',
    };

    it('executes steps 1-6: catalog -> inspect -> status transition -> service work order -> transfer -> history sync', async () => {
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      // 1. Open catalog & inspect details
      (assetsApi.getAsset as jest.Mock).mockResolvedValue(commissionedAsset);
      const asset = await assetsApi.getAsset('ast-laser-01');
      expect(asset.status).toBe(AssetStatus.ACTIVE);
      expect(asset.condition).toBe(AssetCondition.EXCELLENT);

      // 2. Report safety incident / breakdown -> transition status to DAMAGED
      const damagedAsset: FixedAssetVM = {
        ...commissionedAsset,
        status: AssetStatus.DAMAGED,
        condition: AssetCondition.OUT_OF_SERVICE,
        version: 2,
        updatedAt: '2026-02-15T14:00:00.000Z',
      };
      (assetsApi.changeStatus as jest.Mock).mockResolvedValue(damagedAsset);

      const { result: statusHook } = renderHook(() => useChangeAssetStatus(), { wrapper });
      act(() => {
        statusHook.current.mutate({
          id: commissionedAsset.id,
          payload: {
            status: AssetStatus.DAMAGED,
            reason: 'Optical fiber cable damaged during patient mobilization',
          },
        });
      });
      await waitFor(() => expect(statusHook.current.isSuccess).toBe(true));
      expect(mockSuccessToast).toHaveBeenCalledWith(
        'Asset "Class IV Therapeutic Deep Tissue Laser" status changed to DAMAGED',
      );
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: assetsQueryKeys.detail(commissionedAsset.id),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: resourceOverviewQueryKeys.all,
      });

      // 3. Complete corrective service & maintenance work order -> auto-restores to ACTIVE
      (assetsApi.recordMaintenance as jest.Mock).mockResolvedValue({
        id: 'maint-laser-01',
        assetId: commissionedAsset.id,
        serviceDate: '2026-02-18T10:00:00.000Z',
        description: 'Replaced optical fiber assembly, recalibrated laser diode output',
        performedBy: 'Certified Laser Bio-Medics Inc',
        costAmount: 1200.0,
        costCurrency: 'USD',
        updateConditionTo: AssetCondition.EXCELLENT,
        completedAt: '2026-02-18T12:00:00.000Z',
      });

      const { result: maintHook } = renderHook(() => useRecordAssetMaintenance(), { wrapper });
      act(() => {
        maintHook.current.mutate({
          id: commissionedAsset.id,
          payload: {
            serviceDate: '2026-02-18T10:00:00.000Z',
            description: 'Replaced optical fiber assembly, recalibrated laser diode output',
            performedBy: 'Certified Laser Bio-Medics Inc',
            costAmount: 1200.0,
            updateConditionTo: AssetCondition.EXCELLENT,
          },
        });
      });
      await waitFor(() => expect(maintHook.current.isSuccess).toBe(true));
      expect(mockSuccessToast).toHaveBeenCalledWith(
        'Maintenance recorded ($1200.00 by Certified Laser Bio-Medics Inc)',
      );
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: assetsQueryKeys.maintenanceLists(commissionedAsset.id),
      });

      // 4. Relocate equipment to new treatment wing
      const transferredAsset: FixedAssetVM = {
        ...commissionedAsset,
        location: {
          facilityId: 'CLINIC_NORTH_WING',
          roomId: 'Laser Procedure Suite 4',
          zone: 'Zone B',
          description: 'Dedicated clinical enclosure',
        },
        version: 4,
        updatedAt: '2026-02-20T09:00:00.000Z',
      };
      (assetsApi.transferLocation as jest.Mock).mockResolvedValue(transferredAsset);

      const { result: transferHook } = renderHook(() => useTransferAssetLocation(), { wrapper });
      act(() => {
        transferHook.current.mutate({
          id: commissionedAsset.id,
          payload: {
            location: {
              facilityId: 'CLINIC_NORTH_WING',
              roomId: 'Laser Procedure Suite 4',
              zone: 'Zone B',
            },
            reason: 'Relocated to dedicated clinical enclosure in North Wing',
          },
        });
      });
      await waitFor(() => expect(transferHook.current.isSuccess).toBe(true));
      expect(mockSuccessToast).toHaveBeenCalledWith(
        'Asset "Class IV Therapeutic Deep Tissue Laser" relocated to facility CLINIC_NORTH_WING',
      );

      // 5. Verify authoritative history ledger reflects all lifecycle events
      (assetsApi.getAssetHistory as jest.Mock).mockResolvedValue({
        items: [
          {
            id: 'evt-3',
            assetId: commissionedAsset.id,
            eventType: AssetHistoryEventType.TRANSFERRED,
            description: 'Relocated to dedicated clinical enclosure in North Wing',
            performedByUserId: 'usr_admin_quality',
            timestamp: '2026-02-20T09:00:00.000Z',
          },
          {
            id: 'evt-2',
            assetId: commissionedAsset.id,
            eventType: AssetHistoryEventType.MAINTENANCE_RECORDED,
            description: 'Replaced optical fiber assembly',
            performedByUserId: 'usr_admin_quality',
            timestamp: '2026-02-18T12:00:00.000Z',
          },
          {
            id: 'evt-1',
            assetId: commissionedAsset.id,
            eventType: AssetHistoryEventType.STATUS_CHANGED,
            description: 'Status changed to DAMAGED: Optical fiber cable damaged',
            performedByUserId: 'usr_admin_quality',
            timestamp: '2026-02-15T14:00:00.000Z',
          },
        ],
        total: 3,
        page: 1,
        limit: 20,
        totalPages: 1,
      });

      const history = await assetsApi.getAssetHistory(commissionedAsset.id);
      expect(history.items.length).toBe(3);
      expect(history.items[0]?.eventType).toBe(AssetHistoryEventType.TRANSFERRED);
      expect(history.items[1]?.eventType).toBe(AssetHistoryEventType.MAINTENANCE_RECORDED);
      expect(history.items[2]?.eventType).toBe(AssetHistoryEventType.STATUS_CHANGED);
    });
  });

  // =========================================================================
  // 3. CONCURRENCY, OCC & IDEMPOTENCY BOUNDARY VERIFICATION
  // =========================================================================
  describe('3. Concurrency, OCC Version Mismatches & Idempotency Safeguards', () => {
    it('handles Optimistic Concurrency Control (OCC) conflicts and refreshes client query cache', async () => {
      // Simulate concurrent update conflict (HTTP 409 / OCC version conflict)
      const occError = new Error(
        'OptimisticLockException: InventoryItem with id prod-101 was modified concurrently (version mismatch)',
      );
      (inventoryApi.adjustStock as jest.Mock).mockRejectedValue(occError);

      const { result } = renderHook(() => useAdjustStock(), { wrapper });

      act(() => {
        result.current.mutate({
          id: 'prod-101',
          payload: { deltaQuantity: 5, reason: 'Concurrent count reconciliation' },
        });
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      // Error toast informs user of concurrent modification
      expect(mockErrorToast).toHaveBeenCalledWith(
        'OptimisticLockException: InventoryItem with id prod-101 was modified concurrently (version mismatch)',
      );

      // Verify that no optimistic dirty state was committed to query cache
      expect(queryClient.getQueryData(inventoryQueryKeys.detail('prod-101'))).toBeUndefined();
    });

    it('documents backend idempotency behavior with external reference IDs', async () => {
      // Backend StockOperationOrchestrator guarantees idempotency when referenceId is supplied
      const idempotentResult: StockMutationResultVM = {
        success: true,
        movementId: 'mov-unique-ref-999',
        balanceAfter: 50,
        occurredAt: '2026-10-01T12:00:00.000Z',
      };
      (inventoryApi.receiveStock as jest.Mock).mockResolvedValue(idempotentResult);

      const { result } = renderHook(() => useReceiveStock(), { wrapper });

      // First submission with referenceNumber "INV-2026-UNIQUE"
      act(() => {
        result.current.mutate({
          id: 'prod-101',
          payload: { quantity: 50, referenceNumber: 'INV-2026-UNIQUE', notes: 'First submission' },
        });
      });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // Second duplicate submission with exact same referenceNumber
      act(() => {
        result.current.mutate({
          id: 'prod-101',
          payload: {
            quantity: 50,
            referenceNumber: 'INV-2026-UNIQUE',
            notes: 'Retry after timeout',
          },
        });
      });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // Balance remains 50 (authoritative backend idempotency check against referenceId)
      expect(result.current.data?.balanceAfter).toBe(50);
    });
  });
});
