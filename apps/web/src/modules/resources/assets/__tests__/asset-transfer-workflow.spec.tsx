import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TransferAssetLocationDialog } from '../components/asset-transfer-dialog';
import { assetsApi } from '../api/assets-api';
import { NotificationProvider } from '../../../../app/providers/notification-provider';
import { AssetStatus, AssetCondition, AssetCategory } from '@kinergy-platform/core';
import type { FixedAssetVM } from '../types';

jest.mock('../api/assets-api');

const mockActiveAsset: FixedAssetVM = {
  id: 'ast-transfer-1',
  assetTag: 'AST-KNRG-TR1',
  name: 'Woodway Curve Treadmill',
  description: 'Non-motorized manual curve runner',
  category: AssetCategory.GYM_EQUIPMENT,
  status: AssetStatus.ACTIVE,
  condition: AssetCondition.EXCELLENT,
  location: {
    facilityId: 'fac-main',
    roomId: 'Main Floor',
    zone: 'Zone 1',
    description: 'Near front entrance',
  },
  purchaseDate: '2025-01-10T00:00:00.000Z',
  purchaseValueAmount: 9000,
  purchaseValueCurrency: 'USD',
  currentEstimatedValueAmount: 8400,
  version: 2,
  createdAt: '2025-01-10T00:00:00.000Z',
  updatedAt: '2025-01-20T00:00:00.000Z',
};

const mockRetiredAsset: FixedAssetVM = {
  ...mockActiveAsset,
  id: 'ast-retired-1',
  status: AssetStatus.RETIRED,
  condition: AssetCondition.OUT_OF_SERVICE,
};

const mockSoldAsset: FixedAssetVM = {
  ...mockActiveAsset,
  id: 'ast-sold-1',
  status: AssetStatus.SOLD,
  condition: AssetCondition.GOOD,
};

function renderTransferDialog(
  asset: FixedAssetVM | null,
  open: boolean = true,
  onOpenChange: jest.Mock = jest.fn(),
  onSuccess: jest.Mock = jest.fn(),
  customQueryClient?: QueryClient,
) {
  const queryClient =
    customQueryClient ??
    new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
        mutations: { retry: false },
      },
    });

  return {
    queryClient,
    onOpenChange,
    onSuccess,
    ...render(
      <QueryClientProvider client={queryClient}>
        <NotificationProvider>
          <TransferAssetLocationDialog
            asset={asset}
            open={open}
            onOpenChange={onOpenChange}
            onSuccess={onSuccess}
          />
        </NotificationProvider>
      </QueryClientProvider>,
    ),
  };
}

describe('TransferAssetLocationDialog (Auditable Lifecycle Transfer Workflow)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('1. renders operational context: asset identity, current placement, status, and condition', () => {
    renderTransferDialog(mockActiveAsset);

    expect(screen.getByTestId('transfer-asset-dialog')).toBeInTheDocument();
    expect(screen.getByText(/Transfer Physical Location/i)).toBeInTheDocument();
    expect(screen.getByText('Woodway Curve Treadmill')).toBeInTheDocument();
    expect(screen.getByText(/AST-KNRG-TR1/)).toBeInTheDocument();

    // Current Placement Summary block
    const placementSummary = screen.getByTestId('transfer-current-placement');
    expect(placementSummary).toHaveTextContent('fac-main');
    expect(placementSummary).toHaveTextContent('Main Floor');
    expect(placementSummary).toHaveTextContent('Zone 1');
    expect(placementSummary).toHaveTextContent('Near front entrance');

    // Badges
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Excellent')).toBeInTheDocument();
  });

  it('2. executes valid transfer and reconciles cache state', async () => {
    const updatedAsset: FixedAssetVM = {
      ...mockActiveAsset,
      location: {
        facilityId: 'fac-west',
        roomId: 'Studio B',
        zone: 'Zone 3',
        description: 'Placed by rowers',
      },
      version: 3,
    };
    (assetsApi.transferLocation as jest.Mock).mockResolvedValue(updatedAsset);

    const onOpenChange = jest.fn();
    const onSuccess = jest.fn();
    const { queryClient } = renderTransferDialog(mockActiveAsset, true, onOpenChange, onSuccess);

    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    // Fill new destination
    const facilityInput = screen.getByTestId('transfer-facility-input');
    const roomInput = screen.getByTestId('transfer-room-input');
    const zoneInput = screen.getByTestId('transfer-zone-input');
    const reasonInput = screen.getByTestId('transfer-reason-input');

    fireEvent.change(facilityInput, { target: { value: 'fac-west' } });
    fireEvent.change(roomInput, { target: { value: 'Studio B' } });
    fireEvent.change(zoneInput, { target: { value: 'Zone 3' } });
    fireEvent.change(reasonInput, {
      target: { value: 'Relocated for cross-training circuit balance' },
    });

    // Submit
    const submitBtn = screen.getByTestId('transfer-submit-btn');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(assetsApi.transferLocation).toHaveBeenCalledWith('ast-transfer-1', {
        location: {
          facilityId: 'fac-west',
          roomId: 'Studio B',
          zone: 'Zone 3',
          description: 'Near front entrance',
        },
        reason: 'Relocated for cross-training circuit balance',
      });
    });

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(onSuccess).toHaveBeenCalled();
    });

    // Verifies cache reconciliation across detail, list, history, and overview
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['resources', 'assets', 'detail', 'ast-transfer-1'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['resources', 'assets', 'list'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['resources', 'assets', 'detail', 'ast-transfer-1', 'history'],
    });
  });

  it('3. displays loading spinner and prevents duplicate submission while pending', async () => {
    let resolveTransfer: (val: FixedAssetVM) => void;
    const transferPromise = new Promise<FixedAssetVM>((resolve) => {
      resolveTransfer = resolve;
    });
    (assetsApi.transferLocation as jest.Mock).mockReturnValue(transferPromise);

    renderTransferDialog(mockActiveAsset);

    const facilityInput = screen.getByTestId('transfer-facility-input');
    fireEvent.change(facilityInput, { target: { value: 'fac-north' } });

    const submitBtn = screen.getByTestId('transfer-submit-btn');
    fireEvent.click(submitBtn);

    // Button should enter pending state
    await waitFor(() => {
      expect(submitBtn).toBeDisabled();
      expect(screen.getByText('Relocating...')).toBeInTheDocument();
    });

    // Clicking again should not trigger another API call
    fireEvent.click(submitBtn);
    expect(assetsApi.transferLocation).toHaveBeenCalledTimes(1);

    // Resolve mutation
    resolveTransfer!(mockActiveAsset);
  });

  it('4. prohibits transfer on RETIRED assets per AST-INV-1', () => {
    renderTransferDialog(mockRetiredAsset);

    // Terminal alert displayed
    expect(screen.getByTestId('transfer-terminal-alert')).toBeInTheDocument();
    expect(screen.getByText(/Terminal Lifecycle State \(RETIRED\)/i)).toBeInTheDocument();
    expect(screen.getByText(/AST-INV-1/i)).toBeInTheDocument();

    // Inputs and submit button are disabled
    expect(screen.getByTestId('transfer-facility-input')).toBeDisabled();
    expect(screen.getByTestId('transfer-submit-btn')).toBeDisabled();
  });

  it('5. prohibits transfer on SOLD assets per AST-INV-2', () => {
    renderTransferDialog(mockSoldAsset);

    expect(screen.getByTestId('transfer-terminal-alert')).toBeInTheDocument();
    expect(screen.getByText(/Terminal Lifecycle State \(SOLD\)/i)).toBeInTheDocument();
    expect(screen.getByTestId('transfer-submit-btn')).toBeDisabled();
  });

  it('6. preserves and renders meaningful backend domain error messages', async () => {
    (assetsApi.transferLocation as jest.Mock).mockRejectedValue(
      new Error("Target facility 'fac-invalid' does not exist in domain registry"),
    );

    const onOpenChange = jest.fn();
    renderTransferDialog(mockActiveAsset, true, onOpenChange);

    const facilityInput = screen.getByTestId('transfer-facility-input');
    fireEvent.change(facilityInput, { target: { value: 'fac-invalid' } });

    const submitBtn = screen.getByTestId('transfer-submit-btn');
    fireEvent.click(submitBtn);

    // Error banner should appear
    const errorAlert = await screen.findByTestId('transfer-server-error');
    expect(errorAlert).toHaveTextContent(
      "Target facility 'fac-invalid' does not exist in domain registry",
    );

    // Dialog remains open for operator correction
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
