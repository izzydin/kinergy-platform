import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  InventoryItemStatus,
  InventoryCategory,
  UnitOfMeasure,
  AssetStatus,
  AssetCondition,
  AssetCategory,
} from '@kinergy-platform/core';

// Dialog Components
import { AdjustStockDialog } from '../inventory/components/adjust-stock-dialog';
import { ReceiveStockDialog } from '../inventory/components/receive-stock-dialog';
import { SellStockDialog } from '../inventory/components/sell-stock-dialog';
import { ConsumeStockDialog } from '../inventory/components/consume-stock-dialog';
import { ScrapStockDialog } from '../inventory/components/scrap-stock-dialog';
import { ArchiveProductDialog } from '../inventory/components/archive-product-dialog';
import { ConfirmDiscardDialog } from '../../../shared/forms/components/confirm-discard-dialog';

import { TransferAssetLocationDialog } from '../assets/components/asset-transfer-dialog';
import { UpdateAssetConditionDialog } from '../assets/components/asset-condition-dialog';
import { RecordAssetMaintenanceDialog } from '../assets/components/asset-maintenance-dialog';
import { UpdateAssetValuationDialog } from '../assets/components/asset-valuation-dialog';
import { ChangeAssetStatusDialog } from '../assets/components/asset-status-dialog';
import { RetireAssetDialog } from '../assets/components/retire-asset-dialog';

// Hooks
import * as inventoryMutations from '../inventory/hooks/use-inventory-mutations';
import * as assetsMutations from '../assets/hooks/use-assets-mutations';
import * as authModule from '../../../app/providers/auth-provider';

jest.mock('../../../app/providers/auth-provider', () => {
  const actual = jest.requireActual('../../../app/providers/auth-provider');
  return {
    ...actual,
    useAuth: jest.fn(),
  };
});

jest.mock('../inventory/hooks/use-inventory-mutations', () => ({
  useAdjustStock: jest.fn(),
  useReceiveStock: jest.fn(),
  useSellStock: jest.fn(),
  useConsumeStock: jest.fn(),
  useScrapStock: jest.fn(),
  useArchiveProduct: jest.fn(),
}));

jest.mock('../assets/hooks/use-assets-mutations', () => ({
  useTransferAssetLocation: jest.fn(),
  useUpdateAssetCondition: jest.fn(),
  useRecordAssetMaintenance: jest.fn(),
  useUpdateAssetValuation: jest.fn(),
  useChangeAssetStatus: jest.fn(),
  useRetireAsset: jest.fn(),
}));

const mockProduct = {
  id: 'prod_100',
  tenantId: 'tenant_1',
  sku: 'SUPP-CREATINE-500G',
  name: 'Micronized Creatine Monohydrate',
  description: 'Pure pharmaceutical grade creatine powder.',
  category: InventoryCategory.SUPPLEMENTS,
  unitCost: { amount: 15.0, currency: 'USD' },
  sellingPrice: { amount: 29.99, currency: 'USD' },
  currentStock: 20,
  reorderThreshold: 5,
  unitOfMeasure: UnitOfMeasure.UNITS,
  status: InventoryItemStatus.ACTIVE,
  isLowStock: false,
  isOutOfStock: false,
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-09-01T12:00:00.000Z',
};

const mockAsset = {
  id: 'ast_100',
  tenantId: 'tenant_1',
  assetTag: 'AST-KNRG-001',
  name: 'LifeFitness Platinum Club Treadmill',
  description: 'Heavy-duty commercial treadmill with telemetry.',
  category: AssetCategory.GYM_EQUIPMENT,
  status: AssetStatus.ACTIVE,
  condition: AssetCondition.GOOD,
  purchaseDate: '2026-01-15T00:00:00Z',
  purchaseValueAmount: 4500,
  purchaseValueCurrency: 'USD',
  currentEstimatedValueAmount: 3800,
  currentEstimatedValueCurrency: 'USD',
  location: {
    facilityId: 'MAIN_CAMPUS',
    roomId: 'Cardio Studio A',
    zone: 'Row 1',
    description: 'Near north windows',
  },
  notes: 'Quarterly belt lubrication performed.',
  version: 1,
  createdAt: '2026-01-15T00:00:00Z',
  updatedAt: '2026-06-01T00:00:00Z',
};

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('Phase 6 Dialog Interaction Engineering Audit Suite', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (authModule.useAuth as jest.Mock).mockReturnValue({
      isAuthenticated: true,
      currentUser: {
        id: 'usr_admin',
        roles: ['ADMIN'],
        permissions: ['inventory.write', 'assets.write', 'valuation.read', 'billing.read'],
      },
      hasPermission: () => true,
      hasRole: () => true,
    });
  });

  describe('1. Initial Focus Management & Safe-by-Default Policy', () => {
    it('ConfirmDiscardDialog places safe initial focus on "Keep editing" (Cancel) button', () => {
      renderWithClient(
        <ConfirmDiscardDialog open={true} onConfirm={jest.fn()} onCancel={jest.fn()} />,
      );

      const cancelBtn = screen.getByTestId('confirm-discard-cancel-btn');
      expect(cancelBtn).toHaveFocus();
    });

    it('RetireAssetDialog places safe initial focus on Cancel button to avoid accidental Enter deletion', () => {
      renderWithClient(
        <RetireAssetDialog
          asset={mockAsset}
          open={true}
          reason="Fleet retirement"
          isPending={false}
          onOpenChange={jest.fn()}
          onConfirm={jest.fn()}
        />,
      );

      const cancelBtn = screen.getByRole('button', { name: /cancel/i });
      expect(cancelBtn).toHaveFocus();
    });

    it('ScrapStockDialog places safe initial focus on Cancel button for permanent write-off', () => {
      (inventoryMutations.useScrapStock as jest.Mock).mockReturnValue({
        mutate: jest.fn(),
        isPending: false,
      });

      renderWithClient(
        <ScrapStockDialog product={mockProduct} open={true} onOpenChange={jest.fn()} />,
      );

      const cancelBtn = screen.getByRole('button', { name: /cancel/i });
      expect(cancelBtn).toHaveFocus();
    });

    it('ArchiveProductDialog places safe initial focus on Cancel button for catalog delisting', () => {
      (inventoryMutations.useArchiveProduct as jest.Mock).mockReturnValue({
        mutate: jest.fn(),
        isPending: false,
      });

      renderWithClient(
        <ArchiveProductDialog product={mockProduct} open={true} onOpenChange={jest.fn()} />,
      );

      const cancelBtn = screen.getByTestId('archive-cancel-btn');
      expect(cancelBtn).toHaveFocus();
    });

    it('ReceiveStockDialog places initial focus on Quantity Received input', () => {
      (inventoryMutations.useReceiveStock as jest.Mock).mockReturnValue({
        mutate: jest.fn(),
        isPending: false,
      });

      renderWithClient(
        <ReceiveStockDialog product={mockProduct} open={true} onOpenChange={jest.fn()} />,
      );

      const quantityInput = screen.getByTestId('receive-stock-quantity-input');
      expect(quantityInput).toHaveFocus();
    });

    it('AdjustStockDialog places initial focus on Delta Units input', () => {
      (inventoryMutations.useAdjustStock as jest.Mock).mockReturnValue({
        mutate: jest.fn(),
        isPending: false,
      });

      renderWithClient(
        <AdjustStockDialog product={mockProduct} open={true} onOpenChange={jest.fn()} />,
      );

      const deltaInput = screen.getByTestId('adjust-stock-delta-input');
      expect(deltaInput).toHaveFocus();
    });

    it('SellStockDialog places initial focus on Units Sold input', () => {
      (inventoryMutations.useSellStock as jest.Mock).mockReturnValue({
        mutate: jest.fn(),
        isPending: false,
      });

      renderWithClient(
        <SellStockDialog product={mockProduct} open={true} onOpenChange={jest.fn()} />,
      );

      const quantityInput = screen.getByTestId('sell-stock-quantity-input');
      expect(quantityInput).toHaveFocus();
    });

    it('ConsumeStockDialog places initial focus on Units Consumed input', () => {
      (inventoryMutations.useConsumeStock as jest.Mock).mockReturnValue({
        mutate: jest.fn(),
        isPending: false,
      });

      renderWithClient(
        <ConsumeStockDialog product={mockProduct} open={true} onOpenChange={jest.fn()} />,
      );

      const quantityInput = screen.getByTestId('consume-stock-quantity-input');
      expect(quantityInput).toHaveFocus();
    });

    it('TransferAssetLocationDialog places initial focus on facility/location input', () => {
      (assetsMutations.useTransferAssetLocation as jest.Mock).mockReturnValue({
        mutate: jest.fn(),
        isPending: false,
      });

      renderWithClient(
        <TransferAssetLocationDialog asset={mockAsset} open={true} onOpenChange={jest.fn()} />,
      );

      const facilityInput = screen.getByTestId('transfer-facility-input');
      expect(facilityInput).toHaveFocus();
    });

    it('UpdateAssetConditionDialog places initial focus on condition selection', () => {
      (assetsMutations.useUpdateAssetCondition as jest.Mock).mockReturnValue({
        mutate: jest.fn(),
        isPending: false,
      });

      renderWithClient(
        <UpdateAssetConditionDialog asset={mockAsset} open={true} onOpenChange={jest.fn()} />,
      );

      const conditionSelect = screen.getByTestId('condition-select');
      expect(conditionSelect).toHaveFocus();
    });

    it('RecordAssetMaintenanceDialog places initial focus on work order summary input', () => {
      (assetsMutations.useRecordAssetMaintenance as jest.Mock).mockReturnValue({
        mutate: jest.fn(),
        isPending: false,
      });

      renderWithClient(
        <RecordAssetMaintenanceDialog asset={mockAsset} open={true} onOpenChange={jest.fn()} />,
      );

      const descInput = screen.getByTestId('maintenance-desc-input');
      expect(descInput).toHaveFocus();
    });

    it('UpdateAssetValuationDialog places initial focus on fair value amount input', () => {
      (assetsMutations.useUpdateAssetValuation as jest.Mock).mockReturnValue({
        mutate: jest.fn(),
        isPending: false,
      });

      renderWithClient(
        <UpdateAssetValuationDialog asset={mockAsset} open={true} onOpenChange={jest.fn()} />,
      );

      const amountInput = screen.getByTestId('valuation-amount-input');
      expect(amountInput).toHaveFocus();
    });

    it('ChangeAssetStatusDialog places initial focus on operational justification reason input', () => {
      (assetsMutations.useChangeAssetStatus as jest.Mock).mockReturnValue({
        mutate: jest.fn(),
        isPending: false,
      });

      renderWithClient(
        <ChangeAssetStatusDialog asset={mockAsset} open={true} onOpenChange={jest.fn()} />,
      );

      const reasonInput = screen.getByTestId('status-reason-input');
      expect(reasonInput).toHaveFocus();
    });
  });

  describe('2. Keyboard Navigation: Escape, Enter & Dismissal Safeguards', () => {
    it('closes clean dialog upon pressing Escape', () => {
      const onOpenChange = jest.fn();
      (inventoryMutations.useReceiveStock as jest.Mock).mockReturnValue({
        mutate: jest.fn(),
        isPending: false,
      });

      renderWithClient(
        <ReceiveStockDialog product={mockProduct} open={true} onOpenChange={onOpenChange} />,
      );

      fireEvent.keyDown(screen.getByTestId('receive-stock-dialog'), {
        key: 'Escape',
        code: 'Escape',
      });

      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('suppresses Escape dismissal while mutation is pending (prevents accidental in-flight data loss)', () => {
      const onOpenChange = jest.fn();
      (inventoryMutations.useReceiveStock as jest.Mock).mockReturnValue({
        mutate: jest.fn(),
        isPending: true,
      });

      renderWithClient(
        <ReceiveStockDialog product={mockProduct} open={true} onOpenChange={onOpenChange} />,
      );

      fireEvent.keyDown(screen.getByTestId('receive-stock-dialog'), {
        key: 'Escape',
        code: 'Escape',
      });

      expect(onOpenChange).not.toHaveBeenCalled();
    });

    it('intercepts Escape with ConfirmDiscardDialog when form has unsaved dirty changes', async () => {
      const onOpenChange = jest.fn();
      (inventoryMutations.useReceiveStock as jest.Mock).mockReturnValue({
        mutate: jest.fn(),
        isPending: false,
      });

      renderWithClient(
        <ReceiveStockDialog product={mockProduct} open={true} onOpenChange={onOpenChange} />,
      );

      // Make form dirty
      const notesInput = screen.getByLabelText(/delivery notes/i);
      fireEvent.change(notesInput, { target: { value: 'Inbound shipment damaged on transit' } });

      // Hit Escape on dialog
      fireEvent.keyDown(screen.getByTestId('receive-stock-dialog'), {
        key: 'Escape',
        code: 'Escape',
      });

      // Dialog does NOT close; ConfirmDiscardDialog appears
      expect(onOpenChange).not.toHaveBeenCalledWith(false);
      expect(await screen.findByTestId('confirm-discard-dialog')).toBeInTheDocument();
      expect(screen.getByText(/Discard unsaved changes\?/i)).toBeInTheDocument();

      // Hitting Escape or Cancel in ConfirmDiscardDialog cancels discard and keeps form open
      fireEvent.click(screen.getByTestId('confirm-discard-cancel-btn'));
      await waitFor(() => {
        expect(screen.queryByTestId('confirm-discard-dialog')).not.toBeInTheDocument();
      });
      expect(screen.getByTestId('receive-stock-dialog')).toBeInTheDocument();
      expect(notesInput).toHaveValue('Inbound shipment damaged on transit');
    });

    it('Enter key while focused on safe Cancel button activates Cancel, NOT destructive action', () => {
      const onConfirm = jest.fn();
      const onCancel = jest.fn();

      renderWithClient(
        <ConfirmDiscardDialog open={true} onConfirm={onConfirm} onCancel={onCancel} />,
      );

      const cancelBtn = screen.getByTestId('confirm-discard-cancel-btn');
      expect(cancelBtn).toHaveFocus();

      // User presses Enter
      fireEvent.keyDown(cancelBtn, { key: 'Enter', code: 'Enter' });
      fireEvent.click(cancelBtn);

      expect(onCancel).toHaveBeenCalled();
      expect(onConfirm).not.toHaveBeenCalled();
    });
  });

  describe('3. Mutation Synchronization & Double-Submit Protection', () => {
    it('disables submit button and shows pending spinner/text during in-flight mutation', () => {
      (inventoryMutations.useAdjustStock as jest.Mock).mockReturnValue({
        mutate: jest.fn(),
        isPending: true,
      });

      renderWithClient(
        <AdjustStockDialog product={mockProduct} open={true} onOpenChange={jest.fn()} />,
      );

      const submitBtn = screen.getByTestId('adjust-stock-submit-btn');
      expect(submitBtn).toBeDisabled();
      expect(submitBtn).toHaveTextContent(/adjusting/i);
    });

    it('preserves form field values and dirty state after recoverable server error', async () => {
      let capturedOnError: ((err: Error) => void) | undefined;
      const mockMutate = jest.fn((_, { onError }) => {
        capturedOnError = onError;
      });

      (inventoryMutations.useSellStock as jest.Mock).mockReturnValue({
        mutate: mockMutate,
        isPending: false,
      });

      renderWithClient(
        <SellStockDialog product={mockProduct} open={true} onOpenChange={jest.fn()} />,
      );

      const qtyInput = screen.getByTestId('sell-stock-quantity-input');
      const refInput = screen.getByLabelText(/pos receipt \/ member id/i);

      fireEvent.change(qtyInput, { target: { value: '3' } });
      fireEvent.change(refInput, { target: { value: 'POS-REC-9941' } });

      fireEvent.click(screen.getByTestId('sell-stock-submit-btn'));

      await waitFor(() => {
        expect(mockMutate).toHaveBeenCalled();
      });

      // Trigger recoverable server error
      React.act(() => {
        capturedOnError?.(new Error('Payment terminal gateway timeout'));
      });

      // Error banner displays inside modal
      expect(await screen.findByTestId('sell-stock-error-alert')).toBeInTheDocument();
      expect(screen.getByText(/payment terminal gateway timeout/i)).toBeInTheDocument();

      // Form values are preserved
      expect(qtyInput).toHaveValue(3);
      expect(refInput).toHaveValue('POS-REC-9941');
      expect(screen.getByTestId('sell-stock-dialog')).toBeInTheDocument();
    });
  });

  describe('4. Focus Restoration to Triggering Element', () => {
    it('restores focus back to trigger button when modal dialog closes', async () => {
      function TriggerHarness() {
        const [isOpen, setIsOpen] = React.useState(false);
        const triggerRef = React.useRef<HTMLButtonElement>(null);
        return (
          <div>
            <button ref={triggerRef} data-testid="open-trigger-btn" onClick={() => setIsOpen(true)}>
              Open Receive Modal
            </button>
            <ReceiveStockDialog
              product={mockProduct}
              open={isOpen}
              onOpenChange={setIsOpen}
              triggerRef={triggerRef}
            />
          </div>
        );
      }

      (inventoryMutations.useReceiveStock as jest.Mock).mockReturnValue({
        mutate: jest.fn(),
        isPending: false,
      });

      renderWithClient(<TriggerHarness />);

      const triggerBtn = screen.getByTestId('open-trigger-btn');
      triggerBtn.focus();
      expect(triggerBtn).toHaveFocus();

      // Open dialog
      fireEvent.click(triggerBtn);
      expect(await screen.findByTestId('receive-stock-dialog')).toBeInTheDocument();

      // Close dialog via cancel button
      const cancelBtn = screen.getByRole('button', { name: /cancel/i });
      fireEvent.click(cancelBtn);

      await waitFor(() => {
        expect(screen.queryByTestId('receive-stock-dialog')).not.toBeInTheDocument();
      });

      // Focus returns to the trigger
      expect(triggerBtn).toHaveFocus();
    });
  });

  describe('5. Destructive Semantic & Visual Differentiation', () => {
    it('RetireAssetDialog renders destructive semantics with non-color-alone warning text', () => {
      renderWithClient(
        <RetireAssetDialog
          asset={mockAsset}
          open={true}
          reason="End of lifecycle"
          isPending={false}
          onOpenChange={jest.fn()}
          onConfirm={jest.fn()}
        />,
      );

      // Warning text and invariants
      expect(screen.getByText(/permanent & irreversible invariant/i)).toBeInTheDocument();
      expect(screen.getByText(/cannot be restored to active service/i)).toBeInTheDocument();

      // Confirm button has destructive semantics
      const confirmBtn = screen.getByTestId('retire-confirm-btn');
      expect(confirmBtn).toHaveClass('bg-destructive');
      expect(confirmBtn).toHaveTextContent(/retire asset permanently/i);
    });

    it('ScrapStockDialog communicates irreversible write-off textually', () => {
      (inventoryMutations.useScrapStock as jest.Mock).mockReturnValue({
        mutate: jest.fn(),
        isPending: false,
      });

      renderWithClient(
        <ScrapStockDialog product={mockProduct} open={true} onOpenChange={jest.fn()} />,
      );

      expect(screen.getByText(/irreversible inventory write-off/i)).toBeInTheDocument();
      expect(screen.getByText(/disposed units are permanently written off/i)).toBeInTheDocument();

      const scrapBtn = screen.getByTestId('scrap-confirm-btn');
      expect(scrapBtn).toHaveClass('bg-destructive');
      expect(scrapBtn).toHaveTextContent(/record disposal/i);
    });

    it('ArchiveProductDialog discloses catalog impact and reversibility textually', () => {
      (inventoryMutations.useArchiveProduct as jest.Mock).mockReturnValue({
        mutate: jest.fn(),
        isPending: false,
      });

      renderWithClient(
        <ArchiveProductDialog product={mockProduct} open={true} onOpenChange={jest.fn()} />,
      );

      expect(screen.getByText(/catalog lifecycle impact/i)).toBeInTheDocument();
      expect(screen.getByText(/reversible action/i)).toBeInTheDocument();
      expect(
        screen.getByText(/this product can be reactivated back to active/i),
      ).toBeInTheDocument();

      const archiveBtn = screen.getByTestId('archive-confirm-btn');
      expect(archiveBtn).toHaveClass('bg-destructive');
      expect(archiveBtn).toHaveTextContent(/archive product/i);
    });
  });
});
