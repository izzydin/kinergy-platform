import '@testing-library/jest-dom';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { httpClient } from '../../../shared/api/http-client';
import { ValidationError, AuthorizationError, ConflictError } from '../../../shared/api/api-error';
import { inventoryApi, inventoryQueryKeys } from '../inventory/api';
import { assetsApi, assetsQueryKeys } from '../assets/api';
import { resourceOverviewQueryKeys } from '../overview/api';
import {
  useReceiveStock,
  useSellStock,
  useAdjustStock,
} from '../inventory/hooks/use-inventory-mutations';
import { useChangeAssetStatus } from '../assets/hooks/use-assets-mutations';
import { InventoryCategory, StockMovementType } from '../inventory/types';
import {
  AssetStatus,
  AssetCondition,
  AssetCategory,
  CLIENT_ASSET_TRANSITIONS,
} from '../assets/types';

// Mock notification provider to spy on user feedback
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

describe('Milestone 7.2 Resources API Integration & Architectural Foundation Matrix', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
        mutations: { retry: false },
      },
    });
    jest.clearAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  describe('1. Authoritative Backend Request and Response Mapping', () => {
    it('inventoryApi.receiveStock sends verified DTO and maps real backend { item, movement } response to StockMutationResultVM', async () => {
      const postSpy = jest.spyOn(httpClient, 'post').mockResolvedValueOnce({
        item: {
          id: 'item-101',
          sku: 'TAPE-KT-BLK',
          name: 'Kinesiology Tape (Black)',
          category: 'CLINICAL_SUPPLIES',
          unit: 'ROLLS',
          minimumStock: 10,
          quantityOnHand: 45,
          purchaseCostAmount: 12.5,
          purchaseCostCurrency: 'USD',
          sellingPriceAmount: 24.0,
          sellingPriceCurrency: 'USD',
          status: 'ACTIVE',
          version: 3,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-03-01T12:00:00Z',
        },
        movement: {
          id: 'mov-kt-99',
          inventoryItemId: 'item-101',
          movementType: 'PURCHASE',
          quantityDelta: 20,
          balanceAfter: 45,
          unitCostAmount: 12.5,
          unitCostCurrency: 'USD',
          reason: 'Vendor delivery invoice PO-4401',
          recordedByUserId: 'usr-buyer-1',
          referenceId: 'PO-4401',
          recordedAt: '2026-03-01T12:00:00Z',
        },
      });

      const result = await inventoryApi.receiveStock('item-101', {
        quantity: 20,
        unitCost: 12.5,
        referenceNumber: 'PO-4401',
        notes: 'Vendor delivery invoice PO-4401',
      });

      expect(postSpy).toHaveBeenCalledWith('/api/v1/resources/inventory/item-101/receive', {
        quantity: 20,
        unitCost: 12.5,
        referenceNumber: 'PO-4401',
        notes: 'Vendor delivery invoice PO-4401',
      });

      expect(result.success).toBe(true);
      expect(result.balanceAfter).toBe(45);
      expect(result.movementId).toBe('mov-kt-99');
      expect(result.item?.currentStock).toBe(45);
      expect(result.item?.category).toBe(InventoryCategory.CLINICAL_SUPPLIES);
      expect(result.movement?.type).toBe(StockMovementType.PURCHASE);
      expect(result.movement?.referenceNumber).toBe('PO-4401');
    });

    it('inventoryApi.adjustStock transmits signed deltaQuantity and audit reason', async () => {
      const postSpy = jest.spyOn(httpClient, 'post').mockResolvedValueOnce({
        item: {
          id: 'item-101',
          sku: 'TAPE-KT-BLK',
          name: 'Kinesiology Tape (Black)',
          category: 'CLINICAL_SUPPLIES',
          unit: 'ROLLS',
          minimumStock: 10,
          quantityOnHand: 43,
          purchaseCostAmount: 12.5,
          purchaseCostCurrency: 'USD',
          sellingPriceAmount: 24.0,
          sellingPriceCurrency: 'USD',
          status: 'ACTIVE',
          version: 4,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-03-02T10:00:00Z',
        },
        movement: {
          id: 'mov-kt-100',
          inventoryItemId: 'item-101',
          movementType: 'ADJUSTMENT_OUT',
          quantityDelta: -2,
          balanceAfter: 43,
          unitCostAmount: 12.5,
          unitCostCurrency: 'USD',
          reason: 'Physical count audit variance',
          recordedByUserId: 'usr-auditor-1',
          recordedAt: '2026-03-02T10:00:00Z',
        },
      });

      const result = await inventoryApi.adjustStock('item-101', {
        deltaQuantity: -2,
        reason: 'Physical count audit variance',
      });

      expect(postSpy).toHaveBeenCalledWith('/api/v1/resources/inventory/item-101/adjust', {
        deltaQuantity: -2,
        reason: 'Physical count audit variance',
      });
      expect(result.balanceAfter).toBe(43);
      expect(result.movement?.quantity).toBe(2);
      expect(result.movement?.previousBalance).toBe(45);
    });

    it('assetsApi.changeStatus communicates lifecycle transition payload and receives updated entity', async () => {
      const postSpy = jest.spyOn(httpClient, 'post').mockResolvedValueOnce({
        id: 'ast-bio-1',
        assetTag: 'AST-KNE-2026-001',
        name: 'Biodex System 4 Pro',
        description: 'Isokinetic dynamometer',
        category: AssetCategory.THERAPY_EQUIPMENT,
        status: AssetStatus.UNDER_MAINTENANCE,
        condition: AssetCondition.FAIR,
        purchaseDate: '2026-01-15T00:00:00Z',
        location: { facilityId: 'fac-main', roomId: 'room-pt-1' },
        version: 2,
        createdAt: '2026-01-15T00:00:00Z',
        updatedAt: '2026-03-05T08:00:00Z',
      });

      const updated = await assetsApi.changeStatus('ast-bio-1', {
        status: AssetStatus.UNDER_MAINTENANCE,
        reason: 'Hydraulic sensor calibration needed',
      });

      expect(postSpy).toHaveBeenCalledWith('/api/v1/resources/assets/ast-bio-1/status', {
        status: AssetStatus.UNDER_MAINTENANCE,
        reason: 'Hydraulic sensor calibration needed',
      });
      expect(updated.status).toBe(AssetStatus.UNDER_MAINTENANCE);
    });

    it('assetsApi.recordMaintenance logs work order and auto-recovers asset status', async () => {
      const postSpy = jest.spyOn(httpClient, 'post').mockResolvedValueOnce({
        id: 'maint-rec-1',
        assetId: 'ast-bio-1',
        serviceDate: '2026-03-05T14:00:00Z',
        description: 'Sensor recalibration and hydraulic oil replacement',
        cost: { amount: 350.0, currency: 'USD' },
        performedBy: 'Certified Biodex Tech',
        recordedByUserId: 'usr-admin-1',
        createdAt: '2026-03-05T14:30:00Z',
      });

      const rec = await assetsApi.recordMaintenance('ast-bio-1', {
        serviceDate: '2026-03-05T14:00:00Z',
        description: 'Sensor recalibration and hydraulic oil replacement',
        costAmount: 350.0,
        performedBy: 'Certified Biodex Tech',
      });

      expect(postSpy).toHaveBeenCalledWith('/api/v1/resources/assets/ast-bio-1/maintenance', {
        serviceDate: '2026-03-05T14:00:00Z',
        description: 'Sensor recalibration and hydraulic oil replacement',
        costAmount: 350.0,
        performedBy: 'Certified Biodex Tech',
      });
      expect(rec.id).toBe('maint-rec-1');
      expect(rec.cost.amount).toBe(350.0);
    });
  });

  describe('2. Error Normalization & Prevention of False Success', () => {
    it('HTTP 400 InsufficientStockException does not fire success toast or mark mutation as succeeded', async () => {
      jest
        .spyOn(httpClient, 'post')
        .mockRejectedValueOnce(
          new ValidationError('Insufficient available stock. Requested: 10, Available: 4.'),
        );

      const { result } = renderHook(() => useSellStock(), { wrapper });

      act(() => {
        result.current.mutate({
          id: 'item-101',
          payload: { quantity: 10, notes: 'Counter sale' },
        });
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.isSuccess).toBe(false);
      expect(mockSuccessToast).not.toHaveBeenCalled();
      expect(mockErrorToast).toHaveBeenCalledWith(
        'Insufficient available stock. Requested: 10, Available: 4.',
      );
    });

    it('HTTP 409 OptimisticLockException (OCC race condition) triggers error toast without fake success', async () => {
      jest
        .spyOn(httpClient, 'post')
        .mockRejectedValueOnce(
          new ConflictError(
            'Aggregate was modified by another concurrent transaction. Please refresh.',
          ),
        );

      const { result } = renderHook(() => useAdjustStock(), { wrapper });

      act(() => {
        result.current.mutate({
          id: 'item-101',
          payload: { deltaQuantity: 5, reason: 'Found stock' },
        });
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.isSuccess).toBe(false);
      expect(mockSuccessToast).not.toHaveBeenCalled();
      expect(mockErrorToast).toHaveBeenCalledWith(
        'Aggregate was modified by another concurrent transaction. Please refresh.',
      );
    });

    it('HTTP 403 AuthorizationError prevents asset status transition when lacking role/permission', async () => {
      jest
        .spyOn(httpClient, 'post')
        .mockRejectedValueOnce(
          new AuthorizationError('Forbidden: Insufficient privileges to alter lifecycle status.'),
        );

      const { result } = renderHook(() => useChangeAssetStatus(), { wrapper });

      act(() => {
        result.current.mutate({
          id: 'ast-bio-1',
          payload: { status: AssetStatus.RETIRED, reason: 'End of operational service life' },
        });
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.isSuccess).toBe(false);
      expect(mockSuccessToast).not.toHaveBeenCalled();
      expect(mockErrorToast).toHaveBeenCalledWith(
        'Forbidden: Insufficient privileges to alter lifecycle status.',
      );
    });
  });

  describe('3. Query Keys Consistency and Invalidation Scope', () => {
    it('useReceiveStock comprehensively invalidates item, live stock, movements ledger, catalog list, low stock, and overview', async () => {
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
      jest.spyOn(httpClient, 'post').mockResolvedValueOnce({
        balanceAfter: 50,
        movementId: 'mov-1',
        occurredAt: '2026-03-01T00:00:00Z',
      });

      const { result } = renderHook(() => useReceiveStock(), { wrapper });

      act(() => {
        result.current.mutate({
          id: 'item-101',
          payload: { quantity: 10, referenceNumber: 'INV-1' },
        });
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: inventoryQueryKeys.detail('item-101'),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: inventoryQueryKeys.stock('item-101'),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: inventoryQueryKeys.movementsLists('item-101'),
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
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: resourceOverviewQueryKeys.all,
      });
    });

    it('useChangeAssetStatus comprehensively invalidates asset detail, catalog, history, valuation, and overview', async () => {
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
      jest.spyOn(httpClient, 'post').mockResolvedValueOnce({
        id: 'ast-101',
        name: 'Treadmill Commercial',
        status: AssetStatus.UNDER_MAINTENANCE,
      });

      const { result } = renderHook(() => useChangeAssetStatus(), { wrapper });

      act(() => {
        result.current.mutate({
          id: 'ast-101',
          payload: { status: AssetStatus.UNDER_MAINTENANCE, reason: 'Belt service' },
        });
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: assetsQueryKeys.detail('ast-101'),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: assetsQueryKeys.lists(),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: assetsQueryKeys.historyLists('ast-101'),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['resources', 'valuation'],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: resourceOverviewQueryKeys.all,
      });
    });
  });

  describe('4. Client-Safe State Machine Invariants', () => {
    it('CLIENT_ASSET_TRANSITIONS guarantees SOLD is an absolute terminal state with zero exits', () => {
      expect(CLIENT_ASSET_TRANSITIONS[AssetStatus.SOLD]).toEqual([]);
    });

    it('CLIENT_ASSET_TRANSITIONS permits RETIRED only to transition to SOLD (salvage liquidation)', () => {
      expect(CLIENT_ASSET_TRANSITIONS[AssetStatus.RETIRED]).toEqual([AssetStatus.SOLD]);
    });

    it('ACTIVE allows transition to UNDER_MAINTENANCE, DAMAGED, RETIRED, and SOLD', () => {
      expect(CLIENT_ASSET_TRANSITIONS[AssetStatus.ACTIVE]).toEqual([
        AssetStatus.UNDER_MAINTENANCE,
        AssetStatus.DAMAGED,
        AssetStatus.RETIRED,
        AssetStatus.SOLD,
      ]);
    });
  });
});
