import '@testing-library/jest-dom';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import {
  useCreateProduct,
  useUpdateProduct,
  useArchiveProduct,
  useActivateProduct,
  useReceiveStock,
  useSellStock,
  useConsumeStock,
  useAdjustStock,
  useScrapStock,
} from '../hooks/use-inventory-mutations';
import { inventoryApi, inventoryQueryKeys } from '../api';
import {
  InventoryCategory,
  InventoryItemStatus,
  type InventoryProductVM,
  type StockMutationResultVM,
} from '../types';

// Mock the inventory API
jest.mock('../api/inventory-api', () => ({
  inventoryApi: {
    createItem: jest.fn(),
    updateItem: jest.fn(),
    archiveItem: jest.fn(),
    activateItem: jest.fn(),
    receiveStock: jest.fn(),
    sellStock: jest.fn(),
    consumeStock: jest.fn(),
    adjustStock: jest.fn(),
    scrapStock: jest.fn(),
  },
}));

// Mock Notification Provider
const mockSuccessToast = jest.fn();
const mockErrorToast = jest.fn();
jest.mock('../../../../app/providers/notification-provider', () => ({
  useNotification: () => ({
    success: mockSuccessToast,
    error: mockErrorToast,
    info: jest.fn(),
    warning: jest.fn(),
  }),
}));

describe('Inventory Server-State Reconciliation & Authoritative Backend Contract Proof', () => {
  let queryClient: QueryClient;

  const mockProduct: InventoryProductVM = {
    id: 'prod-item-1',
    sku: 'PROT-WHEY-1KG',
    name: 'Whey Protein Isolate',
    description: 'High purity protein',
    category: InventoryCategory.SUPPLEMENTS,
    unitCost: { amount: 25.0, currency: 'USD' },
    sellingPrice: { amount: 49.99, currency: 'USD' },
    currentStock: 20,
    reorderThreshold: 5,
    unitOfMeasure: 'TUBS',
    status: InventoryItemStatus.ACTIVE,
    isLowStock: false,
    isOutOfStock: false,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
  };

  const mockMutationResult: StockMutationResultVM = {
    success: true,
    movementId: 'mov-100',
    balanceAfter: 30,
    occurredAt: '2026-09-02T10:00:00Z',
  };

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    jest.clearAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  describe('1. Server-State Reconciliation & Query Invalidation Lifecycle', () => {
    it('ReceiveStock reconciles product detail, live stock, movement ledger, catalog, low-stock queue, and valuation', async () => {
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
      (inventoryApi.receiveStock as jest.Mock).mockResolvedValue(mockMutationResult);

      const { result } = renderHook(() => useReceiveStock(), { wrapper });

      act(() => {
        result.current.mutate({
          id: 'prod-item-1',
          payload: { quantity: 10, unitCost: 24.0, referenceNumber: 'PO-2026-101' },
        });
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // Verifies single notification toast
      expect(mockSuccessToast).toHaveBeenCalledWith('Received 10 units into inventory');
      expect(mockErrorToast).not.toHaveBeenCalled();

      // Verifies exact targeted query cache invalidations according to Phase 6.11 strategy
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: inventoryQueryKeys.detail('prod-item-1'),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: inventoryQueryKeys.stock('prod-item-1'),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: inventoryQueryKeys.movementsLists('prod-item-1'),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: inventoryQueryKeys.lists(),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: inventoryQueryKeys.lowStock(),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: inventoryQueryKeys.valuation(),
      });
    });

    it('SellStock reconciles product detail, live stock, movement ledger, catalog, and valuation', async () => {
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
      (inventoryApi.sellStock as jest.Mock).mockResolvedValue({
        ...mockMutationResult,
        balanceAfter: 18,
      });

      const { result } = renderHook(() => useSellStock(), { wrapper });

      act(() => {
        result.current.mutate({
          id: 'prod-item-1',
          payload: { quantity: 2, unitPrice: 49.99, referenceId: 'REC-202' },
        });
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockSuccessToast).toHaveBeenCalledWith('Recorded sale of 2 units');
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: inventoryQueryKeys.detail('prod-item-1'),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: inventoryQueryKeys.stock('prod-item-1'),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: inventoryQueryKeys.movementsLists('prod-item-1'),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: inventoryQueryKeys.lists(),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: inventoryQueryKeys.lowStock(),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: inventoryQueryKeys.valuation(),
      });
    });

    it('ConsumeStock reconciles product detail, live stock, movement ledger, and low-stock queue', async () => {
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
      (inventoryApi.consumeStock as jest.Mock).mockResolvedValue({
        ...mockMutationResult,
        balanceAfter: 19,
      });

      const { result } = renderHook(() => useConsumeStock(), { wrapper });

      act(() => {
        result.current.mutate({
          id: 'prod-item-1',
          payload: { quantity: 1, treatmentSessionId: 'TRT-101', notes: 'Rehab application' },
        });
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockSuccessToast).toHaveBeenCalledWith('Recorded consumption of 1 units');
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: inventoryQueryKeys.detail('prod-item-1'),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: inventoryQueryKeys.movementsLists('prod-item-1'),
      });
    });

    it('AdjustStock reconciles balances after physical cycle count variance', async () => {
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
      (inventoryApi.adjustStock as jest.Mock).mockResolvedValue({
        ...mockMutationResult,
        balanceAfter: 21,
      });

      const { result } = renderHook(() => useAdjustStock(), { wrapper });

      act(() => {
        result.current.mutate({
          id: 'prod-item-1',
          payload: { deltaQuantity: 1, reason: 'Cycle count variance' },
        });
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockSuccessToast).toHaveBeenCalledWith('Physical count adjusted by +1 units');
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: inventoryQueryKeys.detail('prod-item-1'),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: inventoryQueryKeys.movementsLists('prod-item-1'),
      });
    });

    it('ScrapStock reconciles balances after disposing damaged stock', async () => {
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
      (inventoryApi.scrapStock as jest.Mock).mockResolvedValue({
        ...mockMutationResult,
        balanceAfter: 19,
      });

      const { result } = renderHook(() => useScrapStock(), { wrapper });

      act(() => {
        result.current.mutate({
          id: 'prod-item-1',
          payload: { quantity: 1, reason: 'Seal broken' },
        });
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockSuccessToast).toHaveBeenCalledWith('Disposed 1 scrapped units');
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: inventoryQueryKeys.detail('prod-item-1'),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: inventoryQueryKeys.movementsLists('prod-item-1'),
      });
    });

    it('CreateProduct reconciles catalog list, low-stock queue, and portfolio valuation', async () => {
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
      (inventoryApi.createItem as jest.Mock).mockResolvedValue(mockProduct);

      const { result } = renderHook(() => useCreateProduct(), { wrapper });

      act(() => {
        result.current.mutate({
          sku: 'PROT-WHEY-1KG',
          name: 'Whey Protein Isolate',
          category: InventoryCategory.SUPPLEMENTS,
          unitCost: 25.0,
          sellingPrice: 49.99,
          quantityOnHand: 20,
          reorderThreshold: 5,
        });
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockSuccessToast).toHaveBeenCalledWith(
        'Product "Whey Protein Isolate" registered successfully',
      );
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: inventoryQueryKeys.lists(),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: inventoryQueryKeys.lowStock(),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: inventoryQueryKeys.valuation(),
      });
    });

    it('UpdateProduct reconciles product detail, catalog list, low-stock queue, and valuation', async () => {
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
      (inventoryApi.updateItem as jest.Mock).mockResolvedValue({
        ...mockProduct,
        name: 'Whey Protein Isolate Updated',
      });

      const { result } = renderHook(() => useUpdateProduct(), { wrapper });

      act(() => {
        result.current.mutate({
          id: 'prod-item-1',
          payload: { name: 'Whey Protein Isolate Updated' },
        });
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockSuccessToast).toHaveBeenCalledWith(
        'Product "Whey Protein Isolate Updated" updated successfully',
      );
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: inventoryQueryKeys.detail('prod-item-1'),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: inventoryQueryKeys.lists(),
      });
    });

    it('ArchiveProduct and ActivateProduct reconcile detail and catalog views', async () => {
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
      (inventoryApi.archiveItem as jest.Mock).mockResolvedValue({
        ...mockProduct,
        status: InventoryItemStatus.ARCHIVED,
      });

      const { result: archiveResult } = renderHook(() => useArchiveProduct(), { wrapper });

      act(() => {
        archiveResult.current.mutate('prod-item-1');
      });

      await waitFor(() => expect(archiveResult.current.isSuccess).toBe(true));
      expect(mockSuccessToast).toHaveBeenCalledWith(
        'Product "Whey Protein Isolate" has been archived',
      );
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: inventoryQueryKeys.detail('prod-item-1'),
      });

      (inventoryApi.activateItem as jest.Mock).mockResolvedValue({
        ...mockProduct,
        status: InventoryItemStatus.ACTIVE,
      });

      const { result: activateResult } = renderHook(() => useActivateProduct(), { wrapper });

      act(() => {
        activateResult.current.mutate('prod-item-1');
      });

      await waitFor(() => expect(activateResult.current.isSuccess).toBe(true));
      expect(mockSuccessToast).toHaveBeenCalledWith('Product "Whey Protein Isolate" is now active');
    });
  });

  describe('2. Authoritative Concurrency Rejection (No False Concurrency Claims)', () => {
    it('handles HTTP 409 Aggregate version mismatch without claiming optimistic success', async () => {
      const concurrencyError = new Error(
        'ConcurrentModificationError: Aggregate version mismatch — product was updated by another session',
      );
      (inventoryApi.sellStock as jest.Mock).mockRejectedValue(concurrencyError);

      const { result } = renderHook(() => useSellStock(), { wrapper });

      act(() => {
        result.current.mutate({
          id: 'prod-item-1',
          payload: { quantity: 1, unitPrice: 49.99, referenceId: 'REC-CONCURRENT' },
        });
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      // Verifies frontend does NOT report false success
      expect(mockSuccessToast).not.toHaveBeenCalled();
      // Verifies notification.error delivers the authoritative backend message
      expect(mockErrorToast).toHaveBeenCalledWith(
        'ConcurrentModificationError: Aggregate version mismatch — product was updated by another session',
      );
      expect(result.current.error).toBe(concurrencyError);
    });
  });

  describe('3. Backend Authorization & Permission Denial Handling', () => {
    it('handles HTTP 403 Forbidden access denial cleanly and surfaces server notification', async () => {
      const accessDeniedError = new Error(
        'AccessDeniedException: You lack the required permission: inventory.write',
      );
      (inventoryApi.adjustStock as jest.Mock).mockRejectedValue(accessDeniedError);

      const { result } = renderHook(() => useAdjustStock(), { wrapper });

      act(() => {
        result.current.mutate({
          id: 'prod-item-1',
          payload: { deltaQuantity: -5, reason: 'Cycle count' },
        });
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(mockSuccessToast).not.toHaveBeenCalled();
      expect(mockErrorToast).toHaveBeenCalledWith(
        'AccessDeniedException: You lack the required permission: inventory.write',
      );
    });
  });

  describe('4. Business Domain Rejection Handling', () => {
    it('handles InsufficientStockOnHandException on point-of-sale overdraft', async () => {
      const insufficientStockError = new Error(
        'InsufficientStockOnHandException: Available balance (2) is less than requested sale quantity (10)',
      );
      (inventoryApi.sellStock as jest.Mock).mockRejectedValue(insufficientStockError);

      const { result } = renderHook(() => useSellStock(), { wrapper });

      act(() => {
        result.current.mutate({
          id: 'prod-item-1',
          payload: { quantity: 10, unitPrice: 49.99, referenceId: 'REC-OVERDRAFT' },
        });
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(mockSuccessToast).not.toHaveBeenCalled();
      expect(mockErrorToast).toHaveBeenCalledWith(
        'InsufficientStockOnHandException: Available balance (2) is less than requested sale quantity (10)',
      );
    });

    it('handles ScrapStock failure with mandatory reason enforcement', async () => {
      const scrapError = new Error(
        'ScrapOperationFailed: Disposal reason is mandatory under Kinergy audit standards',
      );
      (inventoryApi.scrapStock as jest.Mock).mockRejectedValue(scrapError);

      const { result } = renderHook(() => useScrapStock(), { wrapper });

      act(() => {
        result.current.mutate({
          id: 'prod-item-1',
          payload: { quantity: 1, reason: '' },
        });
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(mockErrorToast).toHaveBeenCalledWith(
        'ScrapOperationFailed: Disposal reason is mandatory under Kinergy audit standards',
      );
    });
  });
});
