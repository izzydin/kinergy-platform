import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import {
  ReceiveStockDialog,
  SellStockDialog,
  ScrapStockDialog,
  ProductEditForm,
} from '../components';
import * as inventoryMutations from '../hooks/use-inventory-mutations';
import { InventoryCategory, InventoryItemStatus, UnitOfMeasure } from '@kinergy-platform/core';
import type { InventoryProductVM } from '../types';

jest.mock('../hooks/use-inventory-mutations', () => ({
  useReceiveStock: jest.fn(),
  useSellStock: jest.fn(),
  useConsumeStock: jest.fn(),
  useAdjustStock: jest.fn(),
  useScrapStock: jest.fn(),
  useUpdateProduct: jest.fn(),
  useArchiveProduct: jest.fn(() => ({ mutate: jest.fn(), isPending: false })),
}));

const MOCK_PRODUCT: InventoryProductVM = {
  id: 'prod-hardened-1',
  sku: 'SUPP-WHEY-1KG',
  name: 'Whey Protein Isolate 1kg',
  description: 'Pure protein powder',
  category: InventoryCategory.SUPPLEMENTS,
  unitCost: { amount: 20.0, currency: 'USD' },
  sellingPrice: { amount: 39.99, currency: 'USD' },
  currentStock: 25,
  reorderThreshold: 5,
  unitOfMeasure: UnitOfMeasure.UNITS,
  status: InventoryItemStatus.ACTIVE,
  isLowStock: false,
  isOutOfStock: false,
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-09-01T12:00:00.000Z',
};

describe('Phase 6 Consumable Inventory Forms Hardening', () => {
  let queryClient: QueryClient;
  const mockReceiveMutate = jest.fn();
  const mockSellMutate = jest.fn();
  const mockScrapMutate = jest.fn();

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    jest.clearAllMocks();

    (inventoryMutations.useReceiveStock as jest.Mock).mockReturnValue({
      mutate: mockReceiveMutate,
      isPending: false,
    });

    (inventoryMutations.useSellStock as jest.Mock).mockReturnValue({
      mutate: mockSellMutate,
      isPending: false,
    });

    (inventoryMutations.useScrapStock as jest.Mock).mockReturnValue({
      mutate: mockScrapMutate,
      isPending: false,
    });
  });

  describe('Transactional Dialog Form State & Dirty Guard (ReceiveStockDialog)', () => {
    it('initial clean state: dismisses immediately without discard confirmation', () => {
      const onOpenChange = jest.fn();
      render(
        <QueryClientProvider client={queryClient}>
          <ReceiveStockDialog open={true} product={MOCK_PRODUCT} onOpenChange={onOpenChange} />
        </QueryClientProvider>,
      );

      const cancelBtn = screen.getByRole('button', { name: /^cancel$/i });
      fireEvent.click(cancelBtn);

      // Clean form allows immediate close without prompting
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(screen.queryByText(/discard unsaved changes\?/i)).not.toBeInTheDocument();
    });

    it('dirty state: intercepts dismissal and displays ConfirmDiscardDialog', async () => {
      const onOpenChange = jest.fn();
      render(
        <QueryClientProvider client={queryClient}>
          <ReceiveStockDialog open={true} product={MOCK_PRODUCT} onOpenChange={onOpenChange} />
        </QueryClientProvider>,
      );

      // Modify reference number to make form dirty
      const refInput = screen.getByLabelText(/po \/ invoice reference/i);
      fireEvent.change(refInput, { target: { value: 'PO-NEW-123' } });

      // Attempt to close dialog via Cancel button
      const cancelBtn = screen.getByRole('button', { name: /^cancel$/i });
      fireEvent.click(cancelBtn);

      // Intercepted: onOpenChange not yet invoked, discard dialog open
      expect(onOpenChange).not.toHaveBeenCalled();
      expect(screen.getByText(/discard unsaved changes\?/i)).toBeInTheDocument();
    });

    it('navigation cancelled: "Keep editing" keeps dialog open and preserves user edits', async () => {
      const onOpenChange = jest.fn();
      render(
        <QueryClientProvider client={queryClient}>
          <ReceiveStockDialog open={true} product={MOCK_PRODUCT} onOpenChange={onOpenChange} />
        </QueryClientProvider>,
      );

      const refInput = screen.getByLabelText(/po \/ invoice reference/i) as HTMLInputElement;
      fireEvent.change(refInput, { target: { value: 'PO-KEEP-EDITING' } });

      fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
      expect(screen.getByText(/discard unsaved changes\?/i)).toBeInTheDocument();

      // Click "Keep editing"
      const keepEditingBtn = screen.getByRole('button', { name: /keep editing/i });
      fireEvent.click(keepEditingBtn);

      // Confirm modal closed, main dialog still open with value intact
      expect(screen.queryByText(/discard unsaved changes\?/i)).not.toBeInTheDocument();
      expect(refInput.value).toBe('PO-KEEP-EDITING');
      expect(onOpenChange).not.toHaveBeenCalled();
    });

    it('navigation confirmed: "Discard changes" proceeds with closing dialog', async () => {
      const onOpenChange = jest.fn();
      render(
        <QueryClientProvider client={queryClient}>
          <ReceiveStockDialog open={true} product={MOCK_PRODUCT} onOpenChange={onOpenChange} />
        </QueryClientProvider>,
      );

      const refInput = screen.getByLabelText(/po \/ invoice reference/i);
      fireEvent.change(refInput, { target: { value: 'PO-DISCARD' } });

      fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
      expect(screen.getByText(/discard unsaved changes\?/i)).toBeInTheDocument();

      // Click "Discard changes"
      const discardBtn = screen.getByRole('button', { name: /discard changes/i });
      fireEvent.click(discardBtn);

      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('validation failure: renders accessible error summary and preserves valid inputs', async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <ReceiveStockDialog open={true} product={MOCK_PRODUCT} onOpenChange={jest.fn()} />
        </QueryClientProvider>,
      );

      // Fill valid quantity and notes, but leave required PO reference empty
      const notesInput = screen.getByLabelText(/delivery notes/i) as HTMLInputElement;
      fireEvent.change(notesInput, { target: { value: 'Fragile handling required' } });

      const submitBtn = screen.getByRole('button', { name: /record receipt/i });
      fireEvent.click(submitBtn);

      // Validation errors appear
      await waitFor(() => {
        expect(screen.getAllByRole('alert').length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText(/please fix the following errors/i)).toBeInTheDocument();
      });

      // Valid input is NOT wiped out
      expect(notesInput.value).toBe('Fragile handling required');
      expect(mockReceiveMutate).not.toHaveBeenCalled();
    });

    it('server mutation failure: displays actionable error alert and retains all user inputs', async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <ReceiveStockDialog open={true} product={MOCK_PRODUCT} onOpenChange={jest.fn()} />
        </QueryClientProvider>,
      );

      const refInput = screen.getByLabelText(/po \/ invoice reference/i) as HTMLInputElement;
      fireEvent.change(refInput, { target: { value: 'PO-SERVER-FAIL-99' } });

      const submitBtn = screen.getByRole('button', { name: /record receipt/i });
      fireEvent.click(submitBtn);

      // Simulate server rejection callback
      await waitFor(() => {
        expect(mockReceiveMutate).toHaveBeenCalled();
      });
      const mutationOptions = mockReceiveMutate.mock.calls[0][1];
      mutationOptions.onError(new Error('Vendor account suspended on backend'));

      // Error alert displayed
      await waitFor(() => {
        expect(screen.getByTestId('receive-stock-error-alert')).toBeInTheDocument();
        expect(screen.getByText('Vendor account suspended on backend')).toBeInTheDocument();
      });

      // User input is preserved for correction and retry
      expect(refInput.value).toBe('PO-SERVER-FAIL-99');
    });

    it('successful save: resets form and closes dialog without prompt', async () => {
      const onOpenChange = jest.fn();
      const onSuccess = jest.fn();

      render(
        <QueryClientProvider client={queryClient}>
          <ReceiveStockDialog
            open={true}
            product={MOCK_PRODUCT}
            onOpenChange={onOpenChange}
            onSuccess={onSuccess}
          />
        </QueryClientProvider>,
      );

      const refInput = screen.getByLabelText(/po \/ invoice reference/i);
      fireEvent.change(refInput, { target: { value: 'PO-SUCCESS-200' } });

      const submitBtn = screen.getByRole('button', { name: /record receipt/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(mockReceiveMutate).toHaveBeenCalled();
      });

      // Simulate mutation success
      const mutationOptions = mockReceiveMutate.mock.calls[0][1];
      mutationOptions.onSuccess();

      // Form reset and closed without discard modal
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(onSuccess).toHaveBeenCalled();
      expect(screen.queryByText(/discard unsaved changes\?/i)).not.toBeInTheDocument();
    });

    it('pending submission: disables submit and cancel buttons to prevent duplicate submission', () => {
      (inventoryMutations.useReceiveStock as jest.Mock).mockReturnValue({
        mutate: mockReceiveMutate,
        isPending: true,
      });

      render(
        <QueryClientProvider client={queryClient}>
          <ReceiveStockDialog open={true} product={MOCK_PRODUCT} onOpenChange={jest.fn()} />
        </QueryClientProvider>,
      );

      const submitBtn = screen.getByRole('button', { name: /recording\.\.\./i });
      const cancelBtn = screen.getByRole('button', { name: /^cancel$/i });

      expect(submitBtn).toBeDisabled();
      expect(cancelBtn).toBeDisabled();
    });

    it('SellStockDialog intercepts discard when units are edited', () => {
      const onOpenChange = jest.fn();
      render(
        <QueryClientProvider client={queryClient}>
          <SellStockDialog open={true} product={MOCK_PRODUCT} onOpenChange={onOpenChange} />
        </QueryClientProvider>,
      );

      const qtyInput = screen.getByLabelText(/units sold/i);
      fireEvent.change(qtyInput, { target: { value: '5' } });

      fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
      expect(screen.getByText(/discard unsaved changes\?/i)).toBeInTheDocument();
      expect(onOpenChange).not.toHaveBeenCalled();
    });

    it('ScrapStockDialog intercepts discard when quantity is edited', () => {
      const onOpenChange = jest.fn();
      render(
        <QueryClientProvider client={queryClient}>
          <ScrapStockDialog open={true} product={MOCK_PRODUCT} onOpenChange={onOpenChange} />
        </QueryClientProvider>,
      );

      const qtyInput = screen.getByLabelText(/units disposed/i);
      fireEvent.change(qtyInput, { target: { value: '3' } });

      fireEvent.click(screen.getByTestId('scrap-cancel-btn'));
      expect(screen.getByText(/discard unsaved changes\?/i)).toBeInTheDocument();
      expect(onOpenChange).not.toHaveBeenCalled();
    });
  });

  describe('ProductEditForm Background Sync & Reset Behavior', () => {
    it('does NOT overwrite dirty user input when product reference updates in background', async () => {
      const { rerender } = render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <ProductEditForm product={MOCK_PRODUCT} onSubmit={jest.fn()} />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      const nameInput = screen.getByLabelText(/product name/i) as HTMLInputElement;
      expect(nameInput.value).toBe('Whey Protein Isolate 1kg');

      // Operator types changes into form
      fireEvent.change(nameInput, {
        target: { value: 'Whey Protein Isolate 1kg - Special Reserve' },
      });
      expect(nameInput.value).toBe('Whey Protein Isolate 1kg - Special Reserve');

      // Simulate background query refetch providing a newer product object
      const updatedProductFromRefetch: InventoryProductVM = {
        ...MOCK_PRODUCT,
        currentStock: 30, // balance changed
        updatedAt: '2026-09-09T10:00:00.000Z',
      };

      rerender(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <ProductEditForm product={updatedProductFromRefetch} onSubmit={jest.fn()} />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Form is dirty: user input must NOT be clobbered
      expect(nameInput.value).toBe('Whey Protein Isolate 1kg - Special Reserve');
    });

    it('reset button restores initial product values and marks form clean', async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <ProductEditForm product={MOCK_PRODUCT} onSubmit={jest.fn()} />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      const nameInput = screen.getByLabelText(/product name/i) as HTMLInputElement;
      const resetBtn = screen.getByRole('button', { name: /^reset$/i });

      // Initially clean: reset is disabled
      expect(resetBtn).toBeDisabled();

      // Make dirty
      fireEvent.change(nameInput, { target: { value: 'Temporary Name Edit' } });
      expect(nameInput.value).toBe('Temporary Name Edit');
      expect(resetBtn).not.toBeDisabled();

      // Click Reset
      fireEvent.click(resetBtn);

      // Reverts to original value and resets dirty state
      expect(nameInput.value).toBe('Whey Protein Isolate 1kg');
      expect(resetBtn).toBeDisabled();
    });
  });
});
