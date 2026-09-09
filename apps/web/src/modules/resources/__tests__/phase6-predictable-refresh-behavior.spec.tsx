import '@testing-library/jest-dom';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useInventoryList, useInventoryProduct, useReceiveStock } from '../inventory/hooks';
import {
  useAssetsList,
  useAsset,
  useUpdateAssetCondition,
  useRecordAssetMaintenance,
} from '../assets/hooks';
import { useResourceOverview } from '../overview/hooks';
import { inventoryApi, inventoryQueryKeys } from '../inventory/api';
import { assetsApi, assetsQueryKeys } from '../assets/api';
import { resourceOverviewApi, resourceOverviewQueryKeys } from '../overview/api';
import {
  InventoryCategory,
  InventoryItemStatus,
  type InventoryProductVM,
  type StockMutationResultVM,
} from '../inventory/types';
import { AssetCategory, AssetStatus, AssetCondition, type FixedAssetVM } from '../assets/types';
import type { ResourceOverviewVM } from '../overview/types';

// Mock API modules
jest.mock('../inventory/api/inventory-api', () => ({
  inventoryApi: {
    listItems: jest.fn(),
    getItemById: jest.fn(),
    getMovements: jest.fn(),
    receiveStock: jest.fn(),
    getCategories: jest.fn(),
    getLowStock: jest.fn(),
    getValuation: jest.fn(),
  },
}));

jest.mock('../assets/api/assets-api', () => ({
  assetsApi: {
    listAssets: jest.fn(),
    getAsset: jest.fn(),
    getMaintenanceHistory: jest.fn(),
    updateCondition: jest.fn(),
    recordMaintenance: jest.fn(),
    getCategories: jest.fn(),
    getAssetHistory: jest.fn(),
    getValuationSummary: jest.fn(),
  },
}));

jest.mock('../overview/api/resource-overview-api', () => ({
  resourceOverviewApi: {
    getOverview: jest.fn(),
  },
}));

// Mock Notifications
const mockSuccessToast = jest.fn();
const mockErrorToast = jest.fn();
jest.mock('../../../app/providers/notification-provider', () => ({
  useNotification: () => ({
    success: mockSuccessToast,
    error: mockErrorToast,
    info: jest.fn(),
    warning: jest.fn(),
  }),
}));

describe('Phase 6 Predictable Refresh Behavior Specification', () => {
  let queryClient: QueryClient;

  const mockProduct: InventoryProductVM = {
    id: 'prod-1',
    sku: 'SKU-001',
    name: 'Mineral Water',
    description: 'Electrolyte enhanced water',
    category: InventoryCategory.HEALTHY_DRINKS,
    unitCost: { amount: 1.5, currency: 'USD' },
    sellingPrice: { amount: 3.0, currency: 'USD' },
    currentStock: 100,
    reorderThreshold: 20,
    unitOfMeasure: 'BOTTLES',
    status: InventoryItemStatus.ACTIVE,
    isLowStock: false,
    isOutOfStock: false,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
  };

  const mockAsset: FixedAssetVM = {
    id: 'asset-1',
    assetTag: 'AST-001',
    name: 'Hydro Massage Bed',
    description: null,
    category: AssetCategory.THERAPY_EQUIPMENT,
    status: AssetStatus.ACTIVE,
    condition: AssetCondition.EXCELLENT,
    purchaseDate: '2026-01-01T00:00:00Z',
    purchaseValueAmount: 15000,
    purchaseValueCurrency: 'USD',
    currentEstimatedValueAmount: 14000,
    currentEstimatedValueCurrency: 'USD',
    location: { facilityId: 'HQ-WEST', roomId: 'THERAPY-1' },
    version: 1,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
  };

  const mockOverview: ResourceOverviewVM = {
    combined: {
      totalCombinedValueAmount: 25000,
    },
    consumableInventory: {
      totalValueAmount: 5000,
      totalDistinctItems: 50,
      lowStockItemCount: 2,
      totalQuantityUnits: 100,
    },
    fixedAssets: {
      totalCarryingValueAmount: 20000,
      totalAssetCount: 10,
      activeAssetCount: 9,
      underMaintenanceAssetCount: 1,
      damagedAssetCount: 0,
      retiredAssetCount: 0,
    },
    currency: 'USD',
    calculatedAt: '2026-09-09T18:00:00Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 5 * 60 * 1000,
        },
      },
    });
  });

  const createWrapper = () => {
    return ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };

  describe('1. Initial Load and Deduplication', () => {
    it('initializes query data and avoids duplicate requests during concurrent mounts', async () => {
      (inventoryApi.listItems as jest.Mock).mockResolvedValue({
        items: [mockProduct],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      });

      const wrapper = createWrapper();

      // Mount two hooks concurrently requesting the same query
      const { result: r1 } = renderHook(() => useInventoryList({ page: 1 }), { wrapper });
      const { result: r2 } = renderHook(() => useInventoryList({ page: 1 }), { wrapper });

      await waitFor(() => {
        expect(r1.current.isSuccess).toBe(true);
        expect(r2.current.isSuccess).toBe(true);
      });

      expect(r1.current.data?.items).toHaveLength(1);
      expect(r2.current.data?.items).toHaveLength(1);

      // Query deduplication guarantees only 1 network request was initiated
      expect(inventoryApi.listItems).toHaveBeenCalledTimes(1);
    });

    it('serves cached data within staleTime on subsequent navigation without duplicate network calls', async () => {
      (assetsApi.getAsset as jest.Mock).mockResolvedValue(mockAsset);

      const wrapper = createWrapper();

      // First mount / navigation
      const { result: firstNav, unmount } = renderHook(() => useAsset('asset-1'), { wrapper });
      await waitFor(() => expect(firstNav.current.isSuccess).toBe(true));
      expect(assetsApi.getAsset).toHaveBeenCalledTimes(1);

      // User navigates away
      unmount();

      // User navigates back within staleTime (30s)
      const { result: secondNav } = renderHook(() => useAsset('asset-1'), { wrapper });

      // Immediate data availability without additional network request
      expect(secondNav.current.data?.name).toBe('Hydro Massage Bed');
      expect(assetsApi.getAsset).toHaveBeenCalledTimes(1);
    });
  });

  describe('2. Keep Previous Data on Navigation and Filtering', () => {
    it('preserves existing page items (keepPreviousData) during page change without flashing blank', async () => {
      (inventoryApi.listItems as jest.Mock)
        .mockResolvedValueOnce({
          items: [mockProduct],
          total: 20,
          page: 1,
          limit: 10,
          totalPages: 2,
        })
        .mockImplementationOnce(
          () =>
            new Promise((resolve) =>
              setTimeout(
                () =>
                  resolve({
                    items: [{ ...mockProduct, id: 'prod-2', sku: 'SKU-002' }],
                    total: 20,
                    page: 2,
                    limit: 10,
                    totalPages: 2,
                  }),
                50,
              ),
            ),
        );

      const wrapper = createWrapper();

      const { result, rerender } = renderHook(({ page }) => useInventoryList({ page }), {
        wrapper,
        initialProps: { page: 1 },
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.items[0]?.id).toBe('prod-1');

      // User advances to page 2 (transition state)
      rerender({ page: 2 });

      // While in flight, isFetching is true, but previously loaded page 1 data remains intact!
      expect(result.current.isFetching).toBe(true);
      expect(result.current.data?.items[0]?.id).toBe('prod-1');

      // Once resolved, data updates smoothly
      await waitFor(() => expect(result.current.isFetching).toBe(false));
      expect(result.current.data?.items[0]?.id).toBe('prod-2');
    });

    it('preserves asset list data during filter modification without layout blanking', async () => {
      (assetsApi.listAssets as jest.Mock)
        .mockResolvedValueOnce({
          items: [mockAsset],
          total: 1,
          page: 1,
          limit: 10,
          totalPages: 1,
        })
        .mockImplementationOnce(
          () =>
            new Promise((resolve) =>
              setTimeout(
                () =>
                  resolve({
                    items: [],
                    total: 0,
                    page: 1,
                    limit: 10,
                    totalPages: 0,
                  }),
                50,
              ),
            ),
        );

      const wrapper = createWrapper();

      const { result, rerender } = renderHook(({ category }) => useAssetsList({ category }), {
        wrapper,
        initialProps: { category: undefined as AssetCategory | undefined },
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.items).toHaveLength(1);

      // User filters by category
      rerender({ category: AssetCategory.GYM_EQUIPMENT });

      // Previous items are preserved as placeholderData while fetching
      expect(result.current.isFetching).toBe(true);
      expect(result.current.data?.items).toHaveLength(1);

      await waitFor(() => expect(result.current.isFetching).toBe(false));
      expect(result.current.data?.items).toHaveLength(0);
    });
  });

  describe('3. Manual Refresh and Error Recovery', () => {
    it('updates isFetching during manual refetch and preserves existing data', async () => {
      (resourceOverviewApi.getOverview as jest.Mock).mockResolvedValue(mockOverview);

      const wrapper = createWrapper();

      const { result } = renderHook(() => useResourceOverview(), { wrapper });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.combined.totalCombinedValueAmount).toBe(25000);

      // Trigger manual refresh
      let refetchPromise: Promise<unknown>;
      act(() => {
        refetchPromise = result.current.refetch();
      });

      // Data is still visible during refresh
      expect(result.current.data).toBeDefined();

      await act(async () => {
        await refetchPromise;
      });

      expect(resourceOverviewApi.getOverview).toHaveBeenCalledTimes(2);
      expect(result.current.isFetching).toBe(false);
    });

    it('preserves visible data if a manual refresh encounters a server error', async () => {
      (inventoryApi.getItemById as jest.Mock)
        .mockResolvedValueOnce(mockProduct)
        .mockRejectedValueOnce(new Error('Gateway 504 Timeout'));

      const wrapper = createWrapper();

      const { result } = renderHook(() => useInventoryProduct('prod-1'), { wrapper });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.name).toBe('Mineral Water');

      // Manual refresh fails with error
      let refetchResult: Awaited<ReturnType<typeof result.current.refetch>> | undefined;
      await act(async () => {
        refetchResult = await result.current.refetch();
      });

      // Refetch result reports error
      expect(refetchResult?.isError).toBe(true);
      expect(refetchResult?.error?.message).toBe('Gateway 504 Timeout');

      // TanStack Query retains last known good data in cache so user does not experience blank screen!
      expect(result.current.data?.name).toBe('Mineral Water');
    });
  });

  describe('4. Targeted Mutation Synchronization', () => {
    it('refreshes only affected queries on stock receipt and updates resource overview without wiping unrelated caches', async () => {
      const mockResult: StockMutationResultVM = {
        success: true,
        movementId: 'mov-1',
        balanceAfter: 150,
        occurredAt: '2026-09-09T18:00:00Z',
      };

      (inventoryApi.receiveStock as jest.Mock).mockResolvedValue(mockResult);

      const wrapper = createWrapper();

      // Populate queries across inventory and assets
      queryClient.setQueryData(inventoryQueryKeys.detail('prod-1'), mockProduct);
      queryClient.setQueryData(inventoryQueryKeys.lists(), { items: [mockProduct], total: 1 });
      queryClient.setQueryData(resourceOverviewQueryKeys.all, mockOverview);
      queryClient.setQueryData(assetsQueryKeys.detail('asset-1'), mockAsset);

      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useReceiveStock(), { wrapper });

      await act(async () => {
        result.current.mutate({
          id: 'prod-1',
          payload: {
            quantity: 50,
            unitCost: 1.5,
            referenceNumber: 'PO-9912',
            notes: 'Replenishment',
          },
        });
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // Notification toast fired
      expect(mockSuccessToast).toHaveBeenCalledWith('Received 50 units into inventory');

      // Targeted invalidations occurred for inventory and overview
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: inventoryQueryKeys.detail('prod-1'),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: inventoryQueryKeys.stock('prod-1'),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: inventoryQueryKeys.lists(),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: inventoryQueryKeys.movementsLists('prod-1'),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: resourceOverviewQueryKeys.all,
      });

      // Unrelated domain (assets detail) remains untouched in cache
      expect(queryClient.getQueryData(assetsQueryKeys.detail('asset-1'))).toEqual(mockAsset);
    });

    it('synchronizes condition changes to asset details, history, valuation, and overview dashboard', async () => {
      const updatedAsset = { ...mockAsset, condition: AssetCondition.NEEDS_REPAIR };
      (assetsApi.updateCondition as jest.Mock).mockResolvedValue(updatedAsset);

      const wrapper = createWrapper();

      queryClient.setQueryData(assetsQueryKeys.detail('asset-1'), mockAsset);
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useUpdateAssetCondition(), { wrapper });

      await act(async () => {
        result.current.mutate({
          id: 'asset-1',
          payload: {
            condition: AssetCondition.NEEDS_REPAIR,
            reason: 'Wear and tear detected',
          },
        });
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // Invalidation verified for detail, lists, history, valuation, and overview
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: assetsQueryKeys.detail('asset-1'),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: assetsQueryKeys.lists(),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: assetsQueryKeys.historyLists('asset-1'),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['resources', 'valuation'],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: resourceOverviewQueryKeys.all,
      });
    });

    it('does not invalidate query caches when mutation fails, preserving existing user and server state', async () => {
      (assetsApi.recordMaintenance as jest.Mock).mockRejectedValue(
        new Error('Maintenance vendor not found'),
      );

      const wrapper = createWrapper();

      queryClient.setQueryData(assetsQueryKeys.detail('asset-1'), mockAsset);
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useRecordAssetMaintenance(), { wrapper });

      await act(async () => {
        result.current.mutate({
          id: 'asset-1',
          payload: {
            serviceDate: '2026-09-09T18:00:00Z',
            description: 'Belt replacement',
            costAmount: 500,
            performedBy: 'Tech Corp',
          },
        });
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      // Error notification shown
      expect(mockErrorToast).toHaveBeenCalledWith('Maintenance vendor not found');

      // No invalidations fired on failure, avoiding surprise cache clears or unnecessary network storms
      expect(invalidateSpy).not.toHaveBeenCalled();

      // Asset data in cache is completely preserved
      expect(queryClient.getQueryData(assetsQueryKeys.detail('asset-1'))).toEqual(mockAsset);
    });
  });
});
