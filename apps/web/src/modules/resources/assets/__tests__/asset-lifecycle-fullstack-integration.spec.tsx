import '@testing-library/jest-dom';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import {
  useCreateAsset,
  useUpdateAssetDetails,
  useTransferAssetLocation,
  useChangeAssetStatus,
  useUpdateAssetCondition,
  useRecordAssetMaintenance,
  useUpdateAssetValuation,
} from '../hooks/use-assets-mutations';
import { assetsApi, assetsQueryKeys } from '../api';
import { NotificationProvider } from '../../../../app/providers/notification-provider';
import { AssetCategory, AssetStatus, AssetCondition } from '@kinergy-platform/core';
import type { FixedAssetVM } from '../types';

jest.mock('../api/assets-api');

const mockAssetsApi = assetsApi as jest.Mocked<typeof assetsApi>;

const initialMockAsset: FixedAssetVM = {
  id: 'ast-integ-1',
  assetTag: 'AST-KNRG-INT1',
  name: 'Precor AMT 835 Adaptive Motion Trainer',
  description: 'Total body cardiovascular trainer',
  category: AssetCategory.GYM_EQUIPMENT,
  status: AssetStatus.ACTIVE,
  condition: AssetCondition.EXCELLENT,
  location: {
    facilityId: 'fac-main',
    roomId: 'Cardio Deck',
    zone: 'Zone 1',
  },
  purchaseDate: '2025-01-10T00:00:00.000Z',
  purchaseValueAmount: 7500,
  purchaseValueCurrency: 'USD',
  currentEstimatedValueAmount: 7200,
  version: 1,
  createdAt: '2025-01-10T00:00:00.000Z',
  updatedAt: '2025-01-10T00:00:00.000Z',
};

describe('Fixed Asset Server-State Reconciliation & Architectural Integration', () => {
  let queryClient: QueryClient;
  let invalidateSpy: jest.SpyInstance;

  const createWrapper = () => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
        mutations: { retry: false },
      },
    });

    invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    return ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <NotificationProvider>{children}</NotificationProvider>
      </QueryClientProvider>
    );
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('1. useCreateAsset invalidates catalog list and estate valuation queries', async () => {
    mockAssetsApi.createAsset.mockResolvedValueOnce(initialMockAsset);

    const { result } = renderHook(() => useCreateAsset(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        assetTag: 'AST-KNRG-INT1',
        name: 'Precor AMT 835 Adaptive Motion Trainer',
        category: AssetCategory.GYM_EQUIPMENT,
        location: { facilityId: 'fac-main' },
        purchaseDate: '2025-01-10',
        purchaseValueAmount: 7500,
        purchaseValueCurrency: 'USD',
      });
    });

    // Authoritative confirmation: validates catalog and estate valuation invalidation
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: assetsQueryKeys.lists(),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['resources', 'valuation'],
    });
  });

  it('2. useUpdateAssetDetails invalidates detail, catalog list, and audit history queries', async () => {
    const updatedAsset: FixedAssetVM = {
      ...initialMockAsset,
      name: 'Precor AMT 835 Adaptive Motion Trainer (Refurbished Console)',
      version: 2,
    };
    mockAssetsApi.updateDetails.mockResolvedValueOnce(updatedAsset);

    const { result } = renderHook(() => useUpdateAssetDetails(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        id: 'ast-integ-1',
        payload: {
          name: 'Precor AMT 835 Adaptive Motion Trainer (Refurbished Console)',
          reason: 'Console hardware upgrade',
        },
      });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: assetsQueryKeys.detail('ast-integ-1'),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: assetsQueryKeys.lists(),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: assetsQueryKeys.historyLists('ast-integ-1'),
    });
  });

  it('3. useTransferAssetLocation invalidates placement queries across detail, list, and history', async () => {
    const relocatedAsset: FixedAssetVM = {
      ...initialMockAsset,
      location: {
        facilityId: 'fac-west',
        roomId: 'Cardio Suite B',
        zone: 'Row 4',
      },
      version: 3,
    };
    mockAssetsApi.transferLocation.mockResolvedValueOnce(relocatedAsset);

    const { result } = renderHook(() => useTransferAssetLocation(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        id: 'ast-integ-1',
        payload: {
          location: {
            facilityId: 'fac-west',
            roomId: 'Cardio Suite B',
            zone: 'Row 4',
          },
          reason: 'Facility rebalancing',
        },
      });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: assetsQueryKeys.detail('ast-integ-1'),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: assetsQueryKeys.lists(),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: assetsQueryKeys.historyLists('ast-integ-1'),
    });
  });

  it('4. useChangeAssetStatus invalidates state caches, updating attention queues and valuation', async () => {
    const statusUpdatedAsset: FixedAssetVM = {
      ...initialMockAsset,
      status: AssetStatus.UNDER_MAINTENANCE,
      version: 4,
    };
    mockAssetsApi.changeStatus.mockResolvedValueOnce(statusUpdatedAsset);

    const { result } = renderHook(() => useChangeAssetStatus(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        id: 'ast-integ-1',
        payload: {
          status: AssetStatus.UNDER_MAINTENANCE,
          reason: 'Scheduled bearing replacement',
        },
      });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: assetsQueryKeys.detail('ast-integ-1'),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: assetsQueryKeys.lists(),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: assetsQueryKeys.historyLists('ast-integ-1'),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['resources', 'valuation'],
    });
  });

  it('5. useUpdateAssetCondition invalidates condition ratings across detail and history', async () => {
    const conditionUpdatedAsset: FixedAssetVM = {
      ...initialMockAsset,
      condition: AssetCondition.FAIR,
      version: 5,
    };
    mockAssetsApi.updateCondition.mockResolvedValueOnce(conditionUpdatedAsset);

    const { result } = renderHook(() => useUpdateAssetCondition(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        id: 'ast-integ-1',
        payload: {
          condition: AssetCondition.FAIR,
          reason: 'Normal wear on stride links',
        },
      });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: assetsQueryKeys.detail('ast-integ-1'),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: assetsQueryKeys.lists(),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: assetsQueryKeys.historyLists('ast-integ-1'),
    });
  });

  it('6. useRecordAssetMaintenance invalidates detail, lists, maintenance history, and audit history', async () => {
    mockAssetsApi.recordMaintenance.mockResolvedValueOnce({
      id: 'maint-rec-99',
      assetId: 'ast-integ-1',
      serviceDate: '2026-09-04T00:00:00.000Z',
      description: 'Replaced stride belt and lubricated guide tracks',
      cost: { amount: 180, currency: 'USD' },
      performedBy: 'Precor Certified Technician',
      recordedByUserId: 'usr-tech',
      createdAt: '2026-09-04T10:00:00.000Z',
    });

    const { result } = renderHook(() => useRecordAssetMaintenance(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        id: 'ast-integ-1',
        payload: {
          serviceDate: '2026-09-04',
          description: 'Replaced stride belt and lubricated guide tracks',
          costAmount: 180,
          costCurrency: 'USD',
          performedBy: 'Precor Certified Technician',
        },
      });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: assetsQueryKeys.detail('ast-integ-1'),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: assetsQueryKeys.lists(),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: assetsQueryKeys.maintenanceLists('ast-integ-1'),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: assetsQueryKeys.historyLists('ast-integ-1'),
    });
  });

  it('7. useUpdateAssetValuation invalidates carrying valuation, history, and estate valuation', async () => {
    const valuationUpdatedAsset: FixedAssetVM = {
      ...initialMockAsset,
      currentEstimatedValueAmount: 6800,
      version: 6,
    };
    mockAssetsApi.updateValuation.mockResolvedValueOnce(valuationUpdatedAsset);

    const { result } = renderHook(() => useUpdateAssetValuation(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        id: 'ast-integ-1',
        payload: {
          estimatedValueAmount: 6800,
          currency: 'USD',
          reason: 'Annual straight-line market appraisal',
        },
      });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: assetsQueryKeys.detail('ast-integ-1'),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: assetsQueryKeys.lists(),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: assetsQueryKeys.valuation('ast-integ-1'),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: assetsQueryKeys.historyLists('ast-integ-1'),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['resources', 'valuation'],
    });
  });

  it('8. backend mutation failures reject cleanly without triggering corrupt cache invalidations', async () => {
    mockAssetsApi.transferLocation.mockRejectedValueOnce(
      new Error('Domain invariant violation [AST-INV-1]: Terminal asset cannot be transferred'),
    );

    const { result } = renderHook(() => useTransferAssetLocation(), {
      wrapper: createWrapper(),
    });

    await expect(
      result.current.mutateAsync({
        id: 'ast-integ-1',
        payload: {
          location: { facilityId: 'fac-invalid' },
        },
      }),
    ).rejects.toThrow('[AST-INV-1]');

    // No invalidations should occur on mutation failure
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
