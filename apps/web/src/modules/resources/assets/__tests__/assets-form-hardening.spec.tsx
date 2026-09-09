import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import {
  TransferAssetLocationDialog,
  UpdateAssetConditionDialog,
  RecordAssetMaintenanceDialog,
  UpdateAssetValuationDialog,
  ChangeAssetStatusDialog,
  AssetEditForm,
} from '../components';
import * as assetMutations from '../hooks/use-assets-mutations';
import { AssetStatus, AssetCondition, AssetCategory } from '@kinergy-platform/core';
import type { FixedAssetVM } from '../types';

jest.mock('../hooks/use-assets-mutations', () => ({
  useTransferAssetLocation: jest.fn(),
  useUpdateAssetCondition: jest.fn(),
  useRecordAssetMaintenance: jest.fn(),
  useUpdateAssetValuation: jest.fn(),
  useChangeAssetStatus: jest.fn(),
  useUpdateAssetDetails: jest.fn(),
}));

// Mock Auth Provider to grant both permissions for valuation
jest.mock('../../../../app/providers/auth-provider', () => ({
  useAuth: () => ({
    hasPermission: () => true,
    hasRole: () => true,
    user: { id: 'test-admin', roles: ['ADMIN'], permissions: ['assets.write', 'billing.read'] },
  }),
}));

const MOCK_ASSET: FixedAssetVM = {
  id: 'asset-hardened-1',
  version: 1,
  assetTag: 'AST-GYM-001',
  name: 'LifeFitness Treadmill 95T',
  description: 'Commercial cardio treadmill',
  category: AssetCategory.GYM_EQUIPMENT,
  status: AssetStatus.ACTIVE,
  condition: AssetCondition.GOOD,
  purchaseDate: '2025-01-15',
  purchaseValueAmount: 7500,
  purchaseValueCurrency: 'USD',
  currentEstimatedValueAmount: 6200,
  location: {
    facilityId: 'fac-downtown',
    roomId: 'Cardio Studio A',
    zone: 'Zone 1',
    description: 'Window side bay 4',
  },
  notes: 'Quarterly maintenance verified',
  createdAt: '2025-01-15T00:00:00.000Z',
  updatedAt: '2026-08-10T00:00:00.000Z',
};

describe('Phase 6 Fixed Asset Forms Hardening', () => {
  let queryClient: QueryClient;
  const mockTransferMutate = jest.fn();
  const mockConditionMutate = jest.fn();
  const mockMaintenanceMutate = jest.fn();
  const mockValuationMutate = jest.fn();
  const mockStatusMutate = jest.fn();

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    jest.clearAllMocks();

    (assetMutations.useTransferAssetLocation as jest.Mock).mockReturnValue({
      mutate: mockTransferMutate,
      isPending: false,
    });

    (assetMutations.useUpdateAssetCondition as jest.Mock).mockReturnValue({
      mutate: mockConditionMutate,
      isPending: false,
    });

    (assetMutations.useRecordAssetMaintenance as jest.Mock).mockReturnValue({
      mutate: mockMaintenanceMutate,
      isPending: false,
    });

    (assetMutations.useUpdateAssetValuation as jest.Mock).mockReturnValue({
      mutate: mockValuationMutate,
      isPending: false,
    });

    (assetMutations.useChangeAssetStatus as jest.Mock).mockReturnValue({
      mutate: mockStatusMutate,
      isPending: false,
    });
  });

  describe('TransferAssetLocationDialog Form State & Dirty Guard', () => {
    it('clean state: Cancel dismisses immediately without ConfirmDiscardDialog', () => {
      const onOpenChange = jest.fn();
      render(
        <QueryClientProvider client={queryClient}>
          <TransferAssetLocationDialog open={true} asset={MOCK_ASSET} onOpenChange={onOpenChange} />
        </QueryClientProvider>,
      );

      fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(screen.queryByText(/discard unsaved changes\?/i)).not.toBeInTheDocument();
    });

    it('dirty state: Cancel triggers ConfirmDiscardDialog and keeps editing on cancel', async () => {
      const onOpenChange = jest.fn();
      render(
        <QueryClientProvider client={queryClient}>
          <TransferAssetLocationDialog open={true} asset={MOCK_ASSET} onOpenChange={onOpenChange} />
        </QueryClientProvider>,
      );

      const facilityInput = screen.getByTestId('transfer-facility-input') as HTMLInputElement;
      fireEvent.change(facilityInput, { target: { value: 'fac-uptown-campus' } });

      fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

      // Prompted with discard modal
      expect(screen.getByText(/discard unsaved changes\?/i)).toBeInTheDocument();
      expect(onOpenChange).not.toHaveBeenCalled();

      // Click "Keep editing"
      fireEvent.click(screen.getByRole('button', { name: /keep editing/i }));
      expect(screen.queryByText(/discard unsaved changes\?/i)).not.toBeInTheDocument();
      expect(facilityInput.value).toBe('fac-uptown-campus');
    });

    it('navigation confirmed: "Discard changes" proceeds with closing dialog', () => {
      const onOpenChange = jest.fn();
      render(
        <QueryClientProvider client={queryClient}>
          <TransferAssetLocationDialog open={true} asset={MOCK_ASSET} onOpenChange={onOpenChange} />
        </QueryClientProvider>,
      );

      const facilityInput = screen.getByTestId('transfer-facility-input');
      fireEvent.change(facilityInput, { target: { value: 'fac-discarded' } });

      fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
      expect(screen.getByText(/discard unsaved changes\?/i)).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /discard changes/i }));
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('validation failure: displays error summary and preserves entered location input', async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <TransferAssetLocationDialog open={true} asset={MOCK_ASSET} onOpenChange={jest.fn()} />
        </QueryClientProvider>,
      );

      const facilityInput = screen.getByTestId('transfer-facility-input') as HTMLInputElement;
      fireEvent.change(facilityInput, { target: { value: '' } }); // Facility is required

      const reasonInput = screen.getByTestId('transfer-reason-input') as HTMLInputElement;
      fireEvent.change(reasonInput, {
        target: { value: 'Relocation for annual maintenance check' },
      });

      fireEvent.click(screen.getByTestId('transfer-submit-btn'));

      await waitFor(() => {
        expect(screen.getAllByRole('alert').length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText(/please fix the following errors/i)).toBeInTheDocument();
      });

      // Reason is preserved
      expect(reasonInput.value).toBe('Relocation for annual maintenance check');
      expect(mockTransferMutate).not.toHaveBeenCalled();
    });

    it('server mutation error: displays error alert and preserves inputs for retry', async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <TransferAssetLocationDialog open={true} asset={MOCK_ASSET} onOpenChange={jest.fn()} />
        </QueryClientProvider>,
      );

      const facilityInput = screen.getByTestId('transfer-facility-input') as HTMLInputElement;
      fireEvent.change(facilityInput, { target: { value: 'fac-invalid-destination' } });

      fireEvent.click(screen.getByTestId('transfer-submit-btn'));

      await waitFor(() => {
        expect(mockTransferMutate).toHaveBeenCalled();
      });

      // Trigger mutation failure
      const mutationOptions = mockTransferMutate.mock.calls[0][1];
      mutationOptions.onError(new Error('Destination facility does not exist or is inactive'));

      await waitFor(() => {
        expect(screen.getByTestId('transfer-server-error')).toBeInTheDocument();
        expect(
          screen.getByText('Destination facility does not exist or is inactive'),
        ).toBeInTheDocument();
      });

      expect(facilityInput.value).toBe('fac-invalid-destination');
    });

    it('successful save: resets form and closes dialog without discard prompt', async () => {
      const onOpenChange = jest.fn();
      const onSuccess = jest.fn();

      render(
        <QueryClientProvider client={queryClient}>
          <TransferAssetLocationDialog
            open={true}
            asset={MOCK_ASSET}
            onOpenChange={onOpenChange}
            onSuccess={onSuccess}
          />
        </QueryClientProvider>,
      );

      const facilityInput = screen.getByTestId('transfer-facility-input');
      fireEvent.change(facilityInput, { target: { value: 'fac-north' } });

      fireEvent.click(screen.getByTestId('transfer-submit-btn'));

      await waitFor(() => {
        expect(mockTransferMutate).toHaveBeenCalled();
      });

      const mutationOptions = mockTransferMutate.mock.calls[0][1];
      mutationOptions.onSuccess();

      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(onSuccess).toHaveBeenCalled();
      expect(screen.queryByText(/discard unsaved changes\?/i)).not.toBeInTheDocument();
    });

    it('UpdateAssetConditionDialog intercepts discard when remarks are typed', () => {
      const onOpenChange = jest.fn();
      render(
        <QueryClientProvider client={queryClient}>
          <UpdateAssetConditionDialog open={true} asset={MOCK_ASSET} onOpenChange={onOpenChange} />
        </QueryClientProvider>,
      );

      const reasonInput = screen.getByTestId('condition-reason-input');
      fireEvent.change(reasonInput, { target: { value: 'Inspect motor alignment' } });

      fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
      expect(screen.getByText(/discard unsaved changes\?/i)).toBeInTheDocument();
      expect(onOpenChange).not.toHaveBeenCalled();
    });

    it('RecordAssetMaintenanceDialog intercepts discard when notes are entered', () => {
      const onOpenChange = jest.fn();
      render(
        <QueryClientProvider client={queryClient}>
          <RecordAssetMaintenanceDialog
            open={true}
            asset={MOCK_ASSET}
            onOpenChange={onOpenChange}
          />
        </QueryClientProvider>,
      );

      const notesInput = screen.getByTestId('maintenance-notes-input');
      fireEvent.change(notesInput, { target: { value: 'Invoice #99481' } });

      fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
      expect(screen.getByText(/discard unsaved changes\?/i)).toBeInTheDocument();
      expect(onOpenChange).not.toHaveBeenCalled();
    });

    it('UpdateAssetValuationDialog intercepts discard when valuation amount changes', () => {
      const onOpenChange = jest.fn();
      render(
        <QueryClientProvider client={queryClient}>
          <UpdateAssetValuationDialog open={true} asset={MOCK_ASSET} onOpenChange={onOpenChange} />
        </QueryClientProvider>,
      );

      const amountInput = screen.getByTestId('valuation-amount-input');
      fireEvent.change(amountInput, { target: { value: '5500' } });

      fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
      expect(screen.getByText(/discard unsaved changes\?/i)).toBeInTheDocument();
      expect(onOpenChange).not.toHaveBeenCalled();
    });

    it('ChangeAssetStatusDialog intercepts discard when justification reason is typed', () => {
      const onOpenChange = jest.fn();
      render(
        <QueryClientProvider client={queryClient}>
          <ChangeAssetStatusDialog open={true} asset={MOCK_ASSET} onOpenChange={onOpenChange} />
        </QueryClientProvider>,
      );

      const reasonInput = screen.getByTestId('status-reason-input');
      fireEvent.change(reasonInput, { target: { value: 'Scheduled overhaul' } });

      fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
      expect(screen.getByText(/discard unsaved changes\?/i)).toBeInTheDocument();
      expect(onOpenChange).not.toHaveBeenCalled();
    });
  });

  describe('AssetEditForm Background Sync Protection', () => {
    it('does NOT overwrite dirty user input when asset entity updates from background query', async () => {
      const { rerender } = render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <AssetEditForm asset={MOCK_ASSET} onSubmit={jest.fn()} />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      const nameInput = screen.getByLabelText(/equipment name/i) as HTMLInputElement;
      expect(nameInput.value).toBe('LifeFitness Treadmill 95T');

      // Operator edits name
      fireEvent.change(nameInput, { target: { value: 'LifeFitness Treadmill 95T - Refurbished' } });
      expect(nameInput.value).toBe('LifeFitness Treadmill 95T - Refurbished');

      // Background refetch produces newer asset object
      const refetchedAsset: FixedAssetVM = {
        ...MOCK_ASSET,
        condition: AssetCondition.EXCELLENT,
        updatedAt: '2026-09-09T14:00:00.000Z',
      };

      rerender(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <AssetEditForm asset={refetchedAsset} onSubmit={jest.fn()} />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Form is dirty: user input must be preserved
      expect(nameInput.value).toBe('LifeFitness Treadmill 95T - Refurbished');
    });

    it('reset button restores initial asset values and clears dirty state', async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <AssetEditForm asset={MOCK_ASSET} onSubmit={jest.fn()} />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      const nameInput = screen.getByLabelText(/equipment name/i) as HTMLInputElement;
      const resetBtn = screen.getByRole('button', { name: /^reset$/i });

      expect(resetBtn).toBeDisabled();

      fireEvent.change(nameInput, { target: { value: 'Modified Asset Name' } });
      expect(resetBtn).not.toBeDisabled();

      fireEvent.click(resetBtn);

      expect(nameInput.value).toBe('LifeFitness Treadmill 95T');
      expect(resetBtn).toBeDisabled();
    });
  });
});
