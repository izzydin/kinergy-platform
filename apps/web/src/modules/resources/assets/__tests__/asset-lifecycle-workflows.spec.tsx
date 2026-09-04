import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChangeAssetStatusDialog } from '../components/asset-status-dialog';
import { UpdateAssetConditionDialog } from '../components/asset-condition-dialog';
import { UpdateAssetValuationDialog } from '../components/asset-valuation-dialog';
import { assetsApi } from '../api/assets-api';
import { NotificationProvider } from '../../../../app/providers/notification-provider';
import { AuthProvider } from '../../../../app/providers/auth-provider';
import { AssetStatus, AssetCondition, AssetCategory } from '@kinergy-platform/core';
import type { FixedAssetVM } from '../types';

jest.mock('../api/assets-api');

const mockActiveAsset: FixedAssetVM = {
  id: 'ast-lifecycle-1',
  assetTag: 'AST-KNRG-LC1',
  name: 'Concept2 RowErg Model D',
  description: 'Commercial indoor rower with PM5 monitor',
  category: AssetCategory.GYM_EQUIPMENT,
  status: AssetStatus.ACTIVE,
  condition: AssetCondition.EXCELLENT,
  location: {
    facilityId: 'fac-main',
    roomId: 'Rowing Studio',
  },
  purchaseDate: '2025-01-15T00:00:00.000Z',
  purchaseValueAmount: 1200,
  purchaseValueCurrency: 'USD',
  currentEstimatedValueAmount: 1050,
  version: 1,
  createdAt: '2025-01-15T00:00:00.000Z',
  updatedAt: '2025-01-15T00:00:00.000Z',
};

const mockMaintenanceAssetWithOutOfService: FixedAssetVM = {
  ...mockActiveAsset,
  id: 'ast-damaged-1',
  status: AssetStatus.UNDER_MAINTENANCE,
  condition: AssetCondition.OUT_OF_SERVICE,
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

import type { AuthUser } from '../../../../modules/auth/domain/auth-state.types';

const authorizedManagerSession: AuthUser = {
  id: 'usr-mgr',
  email: 'manager@kinergy.test',
  name: 'Asset Manager',
  roles: ['ADMIN'],
  permissions: ['assets.read', 'assets.write', 'billing.read'],
  tenantId: 'tenant-test',
};

const restrictedTechnicianSession: AuthUser = {
  id: 'usr-tech',
  email: 'tech@kinergy.test',
  name: 'Field Technician',
  roles: ['TRAINER'],
  permissions: ['assets.read', 'assets.write'], // Lacks billing.read
  tenantId: 'tenant-test',
};

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

describe('Asset Lifecycle Workflows (State Machine, Condition & Valuation)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('ChangeAssetStatusDialog (State Machine Transition)', () => {
    it('1. evaluates allowed state machine transitions from ACTIVE and executes transition', async () => {
      const updatedAsset: FixedAssetVM = {
        ...mockActiveAsset,
        status: AssetStatus.UNDER_MAINTENANCE,
        version: 2,
      };
      (assetsApi.changeStatus as jest.Mock).mockResolvedValue(updatedAsset);

      const onOpenChange = jest.fn();
      const onSuccess = jest.fn();
      const queryClient = createTestQueryClient();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      render(
        <QueryClientProvider client={queryClient}>
          <NotificationProvider>
            <ChangeAssetStatusDialog
              asset={mockActiveAsset}
              open={true}
              onOpenChange={onOpenChange}
              onSuccess={onSuccess}
            />
          </NotificationProvider>
        </QueryClientProvider>,
      );

      // Dialog rendered
      expect(screen.getByTestId('change-status-dialog')).toBeInTheDocument();
      expect(screen.getByText('Concept2 RowErg Model D')).toBeInTheDocument();

      // State machine shows allowed transitions from ACTIVE:
      // UNDER_MAINTENANCE, DAMAGED, RETIRED (SOLD is excluded from direct change)
      expect(screen.getByTestId('status-option-UNDER_MAINTENANCE')).toBeInTheDocument();
      expect(screen.getByTestId('status-option-DAMAGED')).toBeInTheDocument();
      expect(screen.getByTestId('status-option-RETIRED')).toBeInTheDocument();
      expect(screen.queryByTestId('status-option-SOLD')).not.toBeInTheDocument();

      // Select UNDER_MAINTENANCE and provide reason
      const reasonInput = screen.getByTestId('status-reason-input');
      fireEvent.change(reasonInput, {
        target: { value: 'Scheduled chain lubrication and sprocket cleaning' },
      });

      const submitBtn = screen.getByTestId('status-submit-btn');
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(assetsApi.changeStatus).toHaveBeenCalledWith('ast-lifecycle-1', {
          status: AssetStatus.UNDER_MAINTENANCE,
          reason: 'Scheduled chain lubrication and sprocket cleaning',
        });
      });

      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(false);
        expect(onSuccess).toHaveBeenCalled();
      });

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['resources', 'assets', 'detail', 'ast-lifecycle-1'],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['resources', 'assets', 'list'],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['resources', 'assets', 'detail', 'ast-lifecycle-1', 'history'],
      });
    });

    it('2. prevents restoring to ACTIVE when physical condition is OUT_OF_SERVICE', async () => {
      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <NotificationProvider>
            <ChangeAssetStatusDialog
              asset={mockMaintenanceAssetWithOutOfService}
              open={true}
              onOpenChange={jest.fn()}
            />
          </NotificationProvider>
        </QueryClientProvider>,
      );

      // Select ACTIVE
      const activeOption = screen.getByTestId('status-option-ACTIVE');
      fireEvent.click(activeOption);

      // Condition block alert appears
      expect(screen.getByTestId('status-condition-block-alert')).toBeInTheDocument();
      expect(
        screen.getByText(/Cannot Restore to Active \(Condition Blocked\)/i),
      ).toBeInTheDocument();

      // Submit button is disabled
      expect(screen.getByTestId('status-submit-btn')).toBeDisabled();
    });

    it('3. locks transitions and renders terminal invariant alerts for RETIRED and SOLD assets', () => {
      const { rerender } = render(
        <QueryClientProvider client={createTestQueryClient()}>
          <NotificationProvider>
            <ChangeAssetStatusDialog
              asset={mockRetiredAsset}
              open={true}
              onOpenChange={jest.fn()}
            />
          </NotificationProvider>
        </QueryClientProvider>,
      );

      // RETIRED terminal alert
      expect(screen.getByTestId('status-terminal-alert')).toBeInTheDocument();
      expect(screen.getByText(/Terminal Lifecycle State \(RETIRED\)/i)).toBeInTheDocument();
      expect(screen.getByTestId('status-submit-btn')).toBeDisabled();

      // Rerender with SOLD asset
      rerender(
        <QueryClientProvider client={createTestQueryClient()}>
          <NotificationProvider>
            <ChangeAssetStatusDialog asset={mockSoldAsset} open={true} onOpenChange={jest.fn()} />
          </NotificationProvider>
        </QueryClientProvider>,
      );

      expect(screen.getByTestId('status-terminal-alert')).toBeInTheDocument();
      expect(screen.getByText(/Terminal Lifecycle State \(SOLD\)/i)).toBeInTheDocument();
      expect(screen.getByTestId('status-submit-btn')).toBeDisabled();
    });

    it('4. preserves and surfaces backend state machine rejection errors', async () => {
      (assetsApi.changeStatus as jest.Mock).mockRejectedValue(
        new Error('Illegal status transition from DAMAGED to ACTIVE per domain rules'),
      );

      const onOpenChange = jest.fn();
      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <NotificationProvider>
            <ChangeAssetStatusDialog
              asset={mockActiveAsset}
              open={true}
              onOpenChange={onOpenChange}
            />
          </NotificationProvider>
        </QueryClientProvider>,
      );

      fireEvent.change(screen.getByTestId('status-reason-input'), {
        target: { value: 'Routine status adjustment test' },
      });

      fireEvent.click(screen.getByTestId('status-submit-btn'));

      const errorAlert = await screen.findByTestId('status-server-error');
      expect(errorAlert).toHaveTextContent(
        'Illegal status transition from DAMAGED to ACTIVE per domain rules',
      );
      expect(onOpenChange).not.toHaveBeenCalledWith(false);
    });
  });

  describe('UpdateAssetConditionDialog (Physical Inspection)', () => {
    it('1. logs valid physical condition rating and reconciles cache state', async () => {
      const updatedAsset: FixedAssetVM = {
        ...mockActiveAsset,
        condition: AssetCondition.GOOD,
      };
      (assetsApi.updateCondition as jest.Mock).mockResolvedValue(updatedAsset);

      const onOpenChange = jest.fn();
      const onSuccess = jest.fn();
      const queryClient = createTestQueryClient();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      render(
        <QueryClientProvider client={queryClient}>
          <NotificationProvider>
            <UpdateAssetConditionDialog
              asset={mockActiveAsset}
              open={true}
              onOpenChange={onOpenChange}
              onSuccess={onSuccess}
            />
          </NotificationProvider>
        </QueryClientProvider>,
      );

      expect(screen.getByTestId('update-condition-dialog')).toBeInTheDocument();
      expect(screen.getByTestId('condition-current-context')).toHaveTextContent(
        'Excellent (Rank 1)',
      );

      // Select GOOD
      const select = screen.getByTestId('condition-select');
      fireEvent.change(select, { target: { value: AssetCondition.GOOD } });

      const reasonInput = screen.getByTestId('condition-reason-input');
      fireEvent.change(reasonInput, {
        target: { value: 'Minor scuff marks on footplates; mechanical parts sound' },
      });

      fireEvent.click(screen.getByTestId('condition-submit-btn'));

      await waitFor(() => {
        expect(assetsApi.updateCondition).toHaveBeenCalledWith('ast-lifecycle-1', {
          condition: AssetCondition.GOOD,
          reason: 'Minor scuff marks on footplates; mechanical parts sound',
        });
      });

      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(false);
        expect(onSuccess).toHaveBeenCalled();
      });

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['resources', 'assets', 'detail', 'ast-lifecycle-1'],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['resources', 'assets', 'list'],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['resources', 'assets', 'detail', 'ast-lifecycle-1', 'history'],
      });
    });

    it('2. triggers priority maintenance warning when selecting NEEDS_REPAIR or OUT_OF_SERVICE', () => {
      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <NotificationProvider>
            <UpdateAssetConditionDialog
              asset={mockActiveAsset}
              open={true}
              onOpenChange={jest.fn()}
            />
          </NotificationProvider>
        </QueryClientProvider>,
      );

      const select = screen.getByTestId('condition-select');
      fireEvent.change(select, { target: { value: AssetCondition.OUT_OF_SERVICE } });

      expect(screen.getByTestId('condition-severe-alert')).toBeInTheDocument();
      expect(screen.getByText(/Priority Maintenance Trigger/i)).toBeInTheDocument();
    });

    it('3. prohibits condition changes on terminal RETIRED or SOLD assets', () => {
      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <NotificationProvider>
            <UpdateAssetConditionDialog
              asset={mockRetiredAsset}
              open={true}
              onOpenChange={jest.fn()}
            />
          </NotificationProvider>
        </QueryClientProvider>,
      );

      expect(screen.getByTestId('condition-terminal-alert')).toBeInTheDocument();
      expect(screen.getByTestId('condition-submit-btn')).toBeDisabled();
    });
  });

  describe('UpdateAssetValuationDialog (Carrying Valuation & Dual Permission)', () => {
    it('1. performs non-negative validation and updates valuation for authorized manager', async () => {
      const updatedAsset: FixedAssetVM = {
        ...mockActiveAsset,
        currentEstimatedValueAmount: 950,
      };
      (assetsApi.updateValuation as jest.Mock).mockResolvedValue(updatedAsset);

      const onOpenChange = jest.fn();
      const onSuccess = jest.fn();
      const queryClient = createTestQueryClient();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      render(
        <QueryClientProvider client={queryClient}>
          <NotificationProvider>
            <AuthProvider initialSessionOverride={authorizedManagerSession}>
              <UpdateAssetValuationDialog
                asset={mockActiveAsset}
                open={true}
                onOpenChange={onOpenChange}
                onSuccess={onSuccess}
              />
            </AuthProvider>
          </NotificationProvider>
        </QueryClientProvider>,
      );

      expect(screen.getByTestId('update-valuation-dialog')).toBeInTheDocument();
      expect(screen.getByTestId('valuation-current-context')).toHaveTextContent('$1,200.00');
      expect(screen.getByTestId('valuation-current-context')).toHaveTextContent('$1,050.00');

      // Update fair value
      const amountInput = screen.getByTestId('valuation-amount-input');
      fireEvent.change(amountInput, { target: { value: '950.00' } });

      const reasonInput = screen.getByTestId('valuation-reason-input');
      fireEvent.change(reasonInput, {
        target: { value: 'End of Q3 fair market impairment assessment' },
      });

      fireEvent.click(screen.getByTestId('valuation-submit-btn'));

      await waitFor(() => {
        expect(assetsApi.updateValuation).toHaveBeenCalledWith('ast-lifecycle-1', {
          estimatedValueAmount: 950,
          currency: 'USD',
          reason: 'End of Q3 fair market impairment assessment',
        });
      });

      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(false);
        expect(onSuccess).toHaveBeenCalled();
      });

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['resources', 'assets', 'detail', 'ast-lifecycle-1'],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['resources', 'assets', 'list'],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['resources', 'assets', 'detail', 'ast-lifecycle-1', 'valuation'],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['resources', 'assets', 'detail', 'ast-lifecycle-1', 'history'],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['resources', 'valuation'],
      });
    });

    it('2. blocks valuation updates when user lacks billing.read financial permission', () => {
      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <NotificationProvider>
            <AuthProvider initialSessionOverride={restrictedTechnicianSession}>
              <UpdateAssetValuationDialog
                asset={mockActiveAsset}
                open={true}
                onOpenChange={jest.fn()}
              />
            </AuthProvider>
          </NotificationProvider>
        </QueryClientProvider>,
      );

      // Permission barrier alert appears
      expect(screen.getByTestId('valuation-permission-alert')).toBeInTheDocument();
      expect(screen.getByText(/Dual-Permission Authorization Required/i)).toBeInTheDocument();

      // Submit button is disabled
      expect(screen.getByTestId('valuation-submit-btn')).toBeDisabled();
    });

    it('3. locks valuation on SOLD assets per invariant AST-INV-1', () => {
      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <NotificationProvider>
            <AuthProvider initialSessionOverride={authorizedManagerSession}>
              <UpdateAssetValuationDialog
                asset={mockSoldAsset}
                open={true}
                onOpenChange={jest.fn()}
              />
            </AuthProvider>
          </NotificationProvider>
        </QueryClientProvider>,
      );

      expect(screen.getByTestId('valuation-terminal-alert')).toBeInTheDocument();
      expect(screen.getByText(/Terminal Realized Valuation \(SOLD\)/i)).toBeInTheDocument();
      expect(screen.getByTestId('valuation-submit-btn')).toBeDisabled();
    });
  });
});
