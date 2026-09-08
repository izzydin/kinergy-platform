import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { ChangeAssetStatusDialog, RecordAssetMaintenanceDialog } from '../components';
import {
  useCreateAsset,
  useChangeAssetStatus,
  useRecordAssetMaintenance,
  useUpdateAssetValuation,
} from '../hooks/use-assets-mutations';
import { assetsApi, assetsQueryKeys } from '../api';
import { resourceOverviewQueryKeys } from '../../overview/api';
import { AssetCategory, AssetStatus, AssetCondition } from '@kinergy-platform/core';
import type { FixedAssetVM } from '../types';

jest.mock('../api/assets-api', () => ({
  assetsApi: {
    createAsset: jest.fn(),
    changeStatus: jest.fn(),
    recordMaintenance: jest.fn(),
    updateValuation: jest.fn(),
  },
}));

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

const MOCK_ASSET: FixedAssetVM = {
  id: 'ast-harden-1',
  assetTag: 'AST-KNRG-001',
  name: 'Life Fitness Integrity Treadmill',
  description: 'Commercial treadmill',
  category: AssetCategory.GYM_EQUIPMENT,
  status: AssetStatus.ACTIVE,
  condition: AssetCondition.EXCELLENT,
  location: {
    facilityId: 'fac-main',
    roomId: 'Cardio Studio',
  },
  purchaseDate: '2025-01-10T00:00:00.000Z',
  purchaseValueAmount: 6000,
  purchaseValueCurrency: 'USD',
  currentEstimatedValueAmount: 5500,
  version: 1,
  createdAt: '2025-01-10T00:00:00.000Z',
  updatedAt: '2025-01-10T00:00:00.000Z',
};

describe('Standardized Phase 6 Fixed Assets Mutation UX Hardening', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    jest.resetAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  describe('1. Query Synchronization & Strict Pessimistic Updates', () => {
    it('useCreateAsset synchronizes list, valuation, and executive resource overview queries', async () => {
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
      (assetsApi.createAsset as jest.Mock).mockResolvedValue(MOCK_ASSET);

      const { result } = renderHook(() => useCreateAsset(), { wrapper });

      act(() => {
        result.current.mutate({
          assetTag: 'AST-KNRG-001',
          name: 'Life Fitness Integrity Treadmill',
          category: AssetCategory.GYM_EQUIPMENT,
          location: { facilityId: 'fac-main' },
          purchaseDate: '2025-01-10',
          purchaseValueAmount: 6000,
          purchaseValueCurrency: 'USD',
        });
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // Success feedback
      expect(mockSuccessToast).toHaveBeenCalledWith(
        'Asset "Life Fitness Integrity Treadmill" (AST-KNRG-001) commissioned successfully',
      );

      // Local asset query synchronization
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: assetsQueryKeys.lists(),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['resources', 'valuation'],
      });

      // Cross-domain executive dashboard synchronization
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: resourceOverviewQueryKeys.all,
      });
    });

    it('useChangeAssetStatus synchronizes detail, lists, history, and executive dashboard queries', async () => {
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
      (assetsApi.changeStatus as jest.Mock).mockResolvedValue({
        ...MOCK_ASSET,
        status: AssetStatus.UNDER_MAINTENANCE,
      });

      const { result } = renderHook(() => useChangeAssetStatus(), { wrapper });

      act(() => {
        result.current.mutate({
          id: 'ast-harden-1',
          payload: { status: AssetStatus.UNDER_MAINTENANCE, reason: 'Belt adjustment' },
        });
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockSuccessToast).toHaveBeenCalledWith(
        'Asset "Life Fitness Integrity Treadmill" status changed to UNDER_MAINTENANCE',
      );
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: assetsQueryKeys.detail('ast-harden-1'),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: assetsQueryKeys.lists(),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: assetsQueryKeys.historyLists('ast-harden-1'),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: resourceOverviewQueryKeys.all,
      });
    });

    it('useRecordAssetMaintenance synchronizes maintenance list, history, and executive dashboard queries', async () => {
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
      (assetsApi.recordMaintenance as jest.Mock).mockResolvedValue({
        id: 'maint-rec-1',
        assetId: 'ast-harden-1',
        serviceDate: '2026-09-08',
        description: 'Treadmill belt lubricated',
        costAmount: 150,
        costCurrency: 'USD',
        performedBy: 'Fleet Specialist',
      });

      const { result } = renderHook(() => useRecordAssetMaintenance(), { wrapper });

      act(() => {
        result.current.mutate({
          id: 'ast-harden-1',
          payload: {
            serviceDate: '2026-09-08',
            description: 'Treadmill belt lubricated',
            costAmount: 150,
            costCurrency: 'USD',
            performedBy: 'Fleet Specialist',
          },
        });
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockSuccessToast).toHaveBeenCalledWith(
        'Maintenance recorded ($150.00 by Fleet Specialist)',
      );
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: assetsQueryKeys.detail('ast-harden-1'),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: assetsQueryKeys.maintenanceLists('ast-harden-1'),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: resourceOverviewQueryKeys.all,
      });
    });

    it('enforces strict pessimistic updates: mutation error does not perform speculative cache mutations', async () => {
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
      const err = new Error('Asset is currently in a terminal state');
      (assetsApi.updateValuation as jest.Mock).mockRejectedValue(err);

      const { result } = renderHook(() => useUpdateAssetValuation(), { wrapper });

      act(() => {
        result.current.mutate({
          id: 'ast-harden-1',
          payload: { estimatedValueAmount: 4800, currency: 'USD', reason: 'Impairment' },
        });
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(mockErrorToast).toHaveBeenCalledWith('Asset is currently in a terminal state');
      expect(mockSuccessToast).not.toHaveBeenCalled();

      // Invariant: no cache invalidation or optimistic update committed on failure
      expect(invalidateSpy).not.toHaveBeenCalled();
    });
  });

  describe('2. ChangeAssetStatusDialog UX Hardening', () => {
    it('disables submit button and shows pending spinner to prevent duplicate clicks', async () => {
      let resolveMutation!: (val: FixedAssetVM) => void;
      const pendingPromise = new Promise<FixedAssetVM>((resolve) => {
        resolveMutation = resolve;
      });
      (assetsApi.changeStatus as jest.Mock).mockReturnValue(pendingPromise);

      render(
        <QueryClientProvider client={queryClient}>
          <ChangeAssetStatusDialog asset={MOCK_ASSET} open={true} onOpenChange={jest.fn()} />
        </QueryClientProvider>,
      );

      fireEvent.change(screen.getByTestId('status-reason-input'), {
        target: { value: 'Annual maintenance checkup' },
      });

      const submitBtn = screen.getByTestId('status-submit-btn');
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(submitBtn).toBeDisabled();
        expect(screen.getByText(/transitioning.../i)).toBeInTheDocument();
      });

      // Duplicate click does nothing because button is disabled
      fireEvent.click(submitBtn);
      expect(assetsApi.changeStatus).toHaveBeenCalledTimes(1);

      act(() => {
        resolveMutation({
          ...MOCK_ASSET,
          status: AssetStatus.UNDER_MAINTENANCE,
        });
      });
    });

    it('preserves user input on server rejection and enables retry', async () => {
      (assetsApi.changeStatus as jest.Mock)
        .mockRejectedValueOnce(new Error('Invalid lifecycle transition from ACTIVE to RETIRED'))
        .mockResolvedValueOnce({
          ...MOCK_ASSET,
          status: AssetStatus.UNDER_MAINTENANCE,
        });

      const onOpenChange = jest.fn();

      render(
        <QueryClientProvider client={queryClient}>
          <ChangeAssetStatusDialog asset={MOCK_ASSET} open={true} onOpenChange={onOpenChange} />
        </QueryClientProvider>,
      );

      fireEvent.change(screen.getByTestId('status-reason-input'), {
        target: { value: 'Inspection revealed cable damage' },
      });

      // Attempt 1: Fails
      fireEvent.click(screen.getByTestId('status-submit-btn'));

      // In-modal error alert appears
      await waitFor(() => {
        expect(screen.getByTestId('status-server-error')).toBeInTheDocument();
        expect(
          screen.getByText('Invalid lifecycle transition from ACTIVE to RETIRED'),
        ).toBeInTheDocument();
      });

      // Form input is retained!
      expect(screen.getByDisplayValue('Inspection revealed cable damage')).toBeInTheDocument();

      // Retry: user submits again
      fireEvent.click(screen.getByTestId('status-submit-btn'));

      await waitFor(() => {
        expect(assetsApi.changeStatus).toHaveBeenCalledTimes(2);
        expect(onOpenChange).toHaveBeenCalledWith(false);
      });
    });

    it('blocks outside click / escape dismissal while status change is in flight', async () => {
      const onOpenChange = jest.fn();
      (assetsApi.changeStatus as jest.Mock).mockReturnValue(new Promise(() => {}));

      render(
        <QueryClientProvider client={queryClient}>
          <ChangeAssetStatusDialog asset={MOCK_ASSET} open={true} onOpenChange={onOpenChange} />
        </QueryClientProvider>,
      );

      fireEvent.change(screen.getByTestId('status-reason-input'), {
        target: { value: 'Preventative diagnostic' },
      });

      fireEvent.click(screen.getByTestId('status-submit-btn'));

      // Wait for pending state
      await waitFor(() => {
        expect(screen.getByTestId('status-submit-btn')).toBeDisabled();
      });

      // Press escape on dialog content
      const dialogContent = screen.getByTestId('change-status-dialog');
      fireEvent.keyDown(dialogContent, { key: 'Escape', code: 'Escape' });

      expect(onOpenChange).not.toHaveBeenCalled();
    });
  });

  describe('3. RecordAssetMaintenanceDialog UX Hardening', () => {
    it('preserves form inputs on maintenance logging error and supports immediate recovery', async () => {
      (assetsApi.recordMaintenance as jest.Mock)
        .mockRejectedValueOnce(new Error('Technician credential expired'))
        .mockResolvedValueOnce({
          id: 'maint-ok',
          assetId: 'ast-harden-1',
          serviceDate: '2026-09-08',
          description: 'Replaced tread belt',
          costAmount: 250,
          costCurrency: 'USD',
          performedBy: 'Certified Master Tech',
        });

      const onOpenChange = jest.fn();

      render(
        <QueryClientProvider client={queryClient}>
          <RecordAssetMaintenanceDialog
            asset={MOCK_ASSET}
            open={true}
            onOpenChange={onOpenChange}
          />
        </QueryClientProvider>,
      );

      fireEvent.change(screen.getByTestId('maintenance-service-date'), {
        target: { value: '2026-09-08' },
      });
      fireEvent.change(screen.getByTestId('maintenance-performed-by'), {
        target: { value: 'Trainee' },
      });
      fireEvent.change(screen.getByTestId('maintenance-desc-input'), {
        target: { value: 'Replaced tread belt' },
      });
      fireEvent.change(screen.getByTestId('maintenance-cost-input'), {
        target: { value: '250.00' },
      });

      // Submit 1: Fails
      fireEvent.click(screen.getByTestId('maintenance-submit-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('maintenance-server-error')).toBeInTheDocument();
        expect(screen.getByText('Technician credential expired')).toBeInTheDocument();
      });

      // Form inputs remain intact
      expect(screen.getByDisplayValue('Replaced tread belt')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Trainee')).toBeInTheDocument();

      // Retry: correct the technician name and click submit again
      fireEvent.change(screen.getByTestId('maintenance-performed-by'), {
        target: { value: 'Certified Master Tech' },
      });
      fireEvent.click(screen.getByTestId('maintenance-submit-btn'));

      await waitFor(() => {
        expect(assetsApi.recordMaintenance).toHaveBeenCalledTimes(2);
        expect(onOpenChange).toHaveBeenCalledWith(false);
      });
    });
  });
});
