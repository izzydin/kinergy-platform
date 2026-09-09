import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AssetStatus, AssetCondition, AssetCategory } from '@kinergy-platform/core';
import { ChangeAssetStatusDialog } from '../components/asset-status-dialog';
import { RetireAssetDialog } from '../components/retire-asset-dialog';
import { assetsApi } from '../api/assets-api';
import type { FixedAssetVM } from '../types';

jest.mock('../api/assets-api', () => ({
  assetsApi: {
    changeStatus: jest.fn(),
  },
  assetsQueryKeys: {
    lists: () => ['resources', 'assets', 'list'],
    detail: (id: string) => ['resources', 'assets', 'detail', id],
    historyLists: (id: string) => ['resources', 'assets', 'detail', id, 'history'],
  },
}));

jest.mock('../../../../app/providers/notification-provider', () => ({
  useNotification: () => ({
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
  }),
}));

const MOCK_ACTIVE_ASSET: FixedAssetVM = {
  id: 'ast-destruct-1',
  assetTag: 'AST-CARDIO-8821',
  name: 'LifeFitness Treadmill Club Series',
  description: 'Commercial grade running treadmill',
  category: AssetCategory.GYM_EQUIPMENT,
  status: AssetStatus.ACTIVE,
  condition: AssetCondition.EXCELLENT,
  notes: null,
  purchaseDate: '2024-02-10T00:00:00.000Z',
  purchaseValueAmount: 4800,
  purchaseValueCurrency: 'USD',
  currentEstimatedValueAmount: 3600,
  currentEstimatedValueCurrency: 'USD',
  location: {
    facilityId: 'FAC-MAIN-CAMPUS',
    roomId: 'Cardio Loft A',
    zone: 'Row 3',
  },
  version: 4,
  createdAt: '2024-02-10T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('Destructive Actions Confirmation Audit — Fixed Assets Decommissioning', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('1. Confirmation Fatigue Isolation (Routine Status Changes)', () => {
    it('does NOT trigger retirement confirmation dialog for routine operational transitions', async () => {
      (assetsApi.changeStatus as jest.Mock).mockResolvedValueOnce({
        ...MOCK_ACTIVE_ASSET,
        status: AssetStatus.UNDER_MAINTENANCE,
      });

      const onOpenChange = jest.fn();
      renderWithClient(
        <ChangeAssetStatusDialog
          asset={MOCK_ACTIVE_ASSET}
          open={true}
          onOpenChange={onOpenChange}
        />,
      );

      // Default target status is UNDER_MAINTENANCE
      fireEvent.change(screen.getByTestId('status-reason-input'), {
        target: { value: 'Scheduled roller bearing lubricant maintenance' },
      });

      // Submit routine operational transition
      fireEvent.click(screen.getByTestId('status-submit-btn'));

      // Retire confirmation dialog MUST NOT be opened
      expect(screen.queryByTestId('retire-asset-dialog')).not.toBeInTheDocument();

      // Mutation executes directly without friction
      await waitFor(() => {
        expect(assetsApi.changeStatus).toHaveBeenCalledWith('ast-destruct-1', {
          status: AssetStatus.UNDER_MAINTENANCE,
          reason: 'Scheduled roller bearing lubricant maintenance',
        });
        expect(onOpenChange).toHaveBeenCalledWith(false);
      });
    });
  });

  describe('2. RetireAssetDialog Destructive Confirmation Gate ([AST-INV-1])', () => {
    it('2.1 intercepts retirement selection with explicit confirmation BEFORE mutation begins', async () => {
      renderWithClient(
        <ChangeAssetStatusDialog asset={MOCK_ACTIVE_ASSET} open={true} onOpenChange={jest.fn()} />,
      );

      // Select RETIRED
      fireEvent.click(screen.getByTestId('status-option-RETIRED'));
      fireEvent.change(screen.getByTestId('status-reason-input'), {
        target: { value: 'Motor drive burnt out; beyond salvageable repair' },
      });

      // Click Apply Status Transition
      fireEvent.click(screen.getByTestId('status-submit-btn'));

      // Retire confirmation dialog opens after validation
      await waitFor(() => {
        expect(screen.getByTestId('retire-asset-dialog')).toBeInTheDocument();
      });

      // Mutation has NOT begun!
      expect(assetsApi.changeStatus).not.toHaveBeenCalled();
      expect(
        screen.getByRole('heading', { name: /retire fixed asset permanently/i }),
      ).toBeInTheDocument();

      // STRICT CHECK: No vague "Are you sure?"
      expect(screen.queryByText(/are you sure/i)).not.toBeInTheDocument();

      // (1) What will happen: Fleet decommission, locks all future mutations
      expect(
        screen.getByText(/immediately locks all future operational mutations/i),
      ).toBeInTheDocument();

      // (2) Affected resource: name, tag, category, location, reason
      const summary = screen.getByTestId('retire-resource-summary');
      expect(summary).toHaveTextContent('LifeFitness Treadmill Club Series');
      expect(summary).toHaveTextContent('AST-CARDIO-8821');
      expect(summary).toHaveTextContent('FAC-MAIN-CAMPUS / Cardio Loft A');
      expect(summary).toHaveTextContent('Motor drive burnt out; beyond salvageable repair');

      // (3) Reversibility: Discloses permanent and irreversible terminal state per [AST-INV-1]
      expect(screen.getByTestId('retire-irreversible-alert')).toHaveTextContent(
        'Permanent & Irreversible Invariant ([AST-INV-1])',
      );
      expect(screen.getByTestId('retire-irreversible-alert')).toHaveTextContent(
        'cannot be restored to ACTIVE service or recommissioned under any circumstance',
      );

      // (4) What user must do to confirm
      expect(
        screen.getByText(/To proceed with decommissioning this asset, click/i),
      ).toBeInTheDocument();
    });

    it('2.2 cancel action aborts retirement without mutating and preserves form context', async () => {
      renderWithClient(
        <ChangeAssetStatusDialog asset={MOCK_ACTIVE_ASSET} open={true} onOpenChange={jest.fn()} />,
      );

      // Select RETIRED and submit
      fireEvent.click(screen.getByTestId('status-option-RETIRED'));
      fireEvent.change(screen.getByTestId('status-reason-input'), {
        target: { value: 'Decommissioning test cancellation' },
      });
      fireEvent.click(screen.getByTestId('status-submit-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('retire-asset-dialog')).toBeInTheDocument();
      });

      // Click Cancel in retirement confirmation
      fireEvent.click(screen.getByTestId('retire-cancel-btn'));

      // Retirement dialog closes, no mutation occurred
      await waitFor(() => {
        expect(screen.queryByTestId('retire-asset-dialog')).not.toBeInTheDocument();
      });
      expect(assetsApi.changeStatus).not.toHaveBeenCalled();

      // User is still in ChangeAssetStatusDialog with input preserved
      expect(screen.getByTestId('change-status-dialog')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Decommissioning test cancellation')).toBeInTheDocument();
    });

    it('2.3 confirm action executes retirement mutation with destructive semantics', async () => {
      (assetsApi.changeStatus as jest.Mock).mockResolvedValueOnce({
        ...MOCK_ACTIVE_ASSET,
        status: AssetStatus.RETIRED,
      });

      const onOpenChange = jest.fn();
      const onSuccess = jest.fn();

      renderWithClient(
        <ChangeAssetStatusDialog
          asset={MOCK_ACTIVE_ASSET}
          open={true}
          onOpenChange={onOpenChange}
          onSuccess={onSuccess}
        />,
      );

      // Select RETIRED and submit to open confirmation
      fireEvent.click(screen.getByTestId('status-option-RETIRED'));
      fireEvent.change(screen.getByTestId('status-reason-input'), {
        target: { value: 'Structural chassis failure during heavy load usage' },
      });
      fireEvent.click(screen.getByTestId('status-submit-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('retire-asset-dialog')).toBeInTheDocument();
      });

      const confirmBtn = screen.getByTestId('retire-confirm-btn');
      expect(confirmBtn.className).toContain('bg-destructive');

      // Confirm permanent retirement
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(assetsApi.changeStatus).toHaveBeenCalledWith('ast-destruct-1', {
          status: AssetStatus.RETIRED,
          reason: 'Structural chassis failure during heavy load usage',
        });
        expect(onOpenChange).toHaveBeenCalledWith(false);
        expect(onSuccess).toHaveBeenCalled();
      });
    });

    it('2.4 Escape key cancels retirement confirmation dialog when idle', async () => {
      renderWithClient(
        <ChangeAssetStatusDialog asset={MOCK_ACTIVE_ASSET} open={true} onOpenChange={jest.fn()} />,
      );

      fireEvent.click(screen.getByTestId('status-option-RETIRED'));
      fireEvent.change(screen.getByTestId('status-reason-input'), {
        target: { value: 'Escape key test reason' },
      });
      fireEvent.click(screen.getByTestId('status-submit-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('retire-asset-dialog')).toBeInTheDocument();
      });

      const retireDialog = screen.getByTestId('retire-asset-dialog');
      fireEvent.keyDown(retireDialog, { key: 'Escape', code: 'Escape' });
      fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });

      await waitFor(
        () => {
          expect(screen.queryByTestId('retire-asset-dialog')).not.toBeInTheDocument();
        },
        { timeout: 3000 },
      );
      expect(assetsApi.changeStatus).not.toHaveBeenCalled();
    });

    it('2.5 pending state prevents duplicate confirmation submission and suppresses Escape', async () => {
      let resolvePromise: (val: unknown) => void = () => {};
      (assetsApi.changeStatus as jest.Mock).mockReturnValue(
        new Promise((resolve) => {
          resolvePromise = resolve;
        }),
      );

      const onOpenChange = jest.fn();
      renderWithClient(
        <ChangeAssetStatusDialog
          asset={MOCK_ACTIVE_ASSET}
          open={true}
          onOpenChange={onOpenChange}
        />,
      );

      fireEvent.click(screen.getByTestId('status-option-RETIRED'));
      fireEvent.change(screen.getByTestId('status-reason-input'), {
        target: { value: 'Duplicate click protection verification' },
      });
      fireEvent.click(screen.getByTestId('status-submit-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('retire-asset-dialog')).toBeInTheDocument();
      });

      const confirmBtn = screen.getByTestId('retire-confirm-btn');
      const cancelBtn = screen.getByTestId('retire-cancel-btn');

      // Click 1
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(confirmBtn).toBeDisabled();
        expect(cancelBtn).toBeDisabled();
        expect(screen.getByText(/retiring asset\.\.\./i)).toBeInTheDocument();
      });

      // Duplicate click 2
      fireEvent.click(confirmBtn);
      expect(assetsApi.changeStatus).toHaveBeenCalledTimes(1);

      // Escape attempt while pending
      const retireDialog = screen.getByTestId('retire-asset-dialog');
      fireEvent.keyDown(retireDialog, { key: 'Escape', code: 'Escape' });
      expect(screen.getByTestId('retire-asset-dialog')).toBeInTheDocument();

      // Resolve mutation cleanly
      resolvePromise({ ...MOCK_ACTIVE_ASSET, status: AssetStatus.RETIRED });
      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(false);
      });
    });
  });

  describe('3. RetireAssetDialog Standalone Primitive Verification', () => {
    it('renders null when asset is null', () => {
      const { container } = renderWithClient(
        <RetireAssetDialog
          asset={null}
          open={true}
          reason="Test"
          isPending={false}
          onOpenChange={jest.fn()}
          onConfirm={jest.fn()}
        />,
      );
      expect(container.firstChild).toBeNull();
    });
  });
});
