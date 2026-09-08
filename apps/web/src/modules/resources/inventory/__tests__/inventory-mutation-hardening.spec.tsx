import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { ReceiveStockDialog, ArchiveProductDialog } from '../components';
import {
  useReceiveStock,
  useAdjustStock,
  useArchiveProduct,
} from '../hooks/use-inventory-mutations';
import { inventoryApi, inventoryQueryKeys } from '../api';
import { resourceOverviewQueryKeys } from '../../overview/api';
import { InventoryCategory, InventoryItemStatus, UnitOfMeasure } from '@kinergy-platform/core';
import type { InventoryProductVM, StockMutationResultVM } from '../types';

// Mock the API and Notifications
jest.mock('../api/inventory-api', () => ({
  inventoryApi: {
    receiveStock: jest.fn(),
    adjustStock: jest.fn(),
    archiveItem: jest.fn(),
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

const MOCK_PRODUCT: InventoryProductVM = {
  id: 'prod-hardened-1',
  sku: 'PROT-WHEY-1KG',
  name: 'Whey Protein Isolate',
  description: 'Pure protein powder',
  category: InventoryCategory.SUPPLEMENTS,
  unitCost: { amount: 20.0, currency: 'USD' },
  sellingPrice: { amount: 39.99, currency: 'USD' },
  currentStock: 15,
  reorderThreshold: 5,
  unitOfMeasure: UnitOfMeasure.UNITS,
  status: InventoryItemStatus.ACTIVE,
  isLowStock: false,
  isOutOfStock: false,
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-09-01T12:00:00.000Z',
};

describe('Standardized Phase 6 Inventory Mutation UX Hardening', () => {
  let queryClient: QueryClient;

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

  describe('1. Hook Query Synchronization & Pessimistic Flow Proof', () => {
    it('useReceiveStock synchronizes local queries AND cross-domain resource overview dashboard', async () => {
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
      const mockResult: StockMutationResultVM = {
        success: true,
        movementId: 'mov-1',
        balanceAfter: 25,
        occurredAt: '2026-09-08T00:00:00Z',
      };
      (inventoryApi.receiveStock as jest.Mock).mockResolvedValue(mockResult);

      const { result } = renderHook(() => useReceiveStock(), { wrapper });

      act(() => {
        result.current.mutate({
          id: 'prod-hardened-1',
          payload: { quantity: 10, referenceNumber: 'PO-9001' },
        });
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // Business-oriented, concise success toast
      expect(mockSuccessToast).toHaveBeenCalledWith('Received 10 units into inventory');

      // Local query synchronization
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: inventoryQueryKeys.detail('prod-hardened-1'),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: inventoryQueryKeys.stock('prod-hardened-1'),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: inventoryQueryKeys.movementsLists('prod-hardened-1'),
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

      // Cross-domain Executive Dashboard synchronization (prevents stale cockpit)
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: resourceOverviewQueryKeys.all,
      });
    });

    it('enforces strict pessimistic mutation: rejection triggers error toast and does not alter cache', async () => {
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
      const serverError = new Error('Database transaction lock conflict');
      (inventoryApi.adjustStock as jest.Mock).mockRejectedValue(serverError);

      const { result } = renderHook(() => useAdjustStock(), { wrapper });

      act(() => {
        result.current.mutate({
          id: 'prod-hardened-1',
          payload: { deltaQuantity: -5, reason: 'Cycle count loss' },
        });
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      // Error toast communicates exact non-technical/business error
      expect(mockErrorToast).toHaveBeenCalledWith('Database transaction lock conflict');
      expect(mockSuccessToast).not.toHaveBeenCalled();

      // Invariant: no cache invalidation or optimistic update committed on failure
      expect(invalidateSpy).not.toHaveBeenCalled();
    });

    it('useArchiveProduct synchronizes product detail, lists, valuation, and executive overview', async () => {
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
      (inventoryApi.archiveItem as jest.Mock).mockResolvedValue({
        ...MOCK_PRODUCT,
        status: InventoryItemStatus.ARCHIVED,
      });

      const { result } = renderHook(() => useArchiveProduct(), { wrapper });

      act(() => {
        result.current.mutate('prod-hardened-1');
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockSuccessToast).toHaveBeenCalledWith(
        'Product "Whey Protein Isolate" has been archived',
      );
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: inventoryQueryKeys.detail('prod-hardened-1'),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: inventoryQueryKeys.lists(),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: resourceOverviewQueryKeys.all,
      });
    });
  });

  describe('2. ReceiveStockDialog Interaction & Error Recovery', () => {
    it('disables buttons during pending state to prevent duplicate submissions', async () => {
      let resolveMutation!: (val: StockMutationResultVM) => void;
      const pendingPromise = new Promise<StockMutationResultVM>((resolve) => {
        resolveMutation = resolve;
      });
      (inventoryApi.receiveStock as jest.Mock).mockReturnValue(pendingPromise);

      render(
        <QueryClientProvider client={queryClient}>
          <ReceiveStockDialog product={MOCK_PRODUCT} open={true} onOpenChange={jest.fn()} />
        </QueryClientProvider>,
      );

      fireEvent.change(screen.getByLabelText(/quantity received/i), { target: { value: '5' } });
      fireEvent.change(screen.getByLabelText(/po \/ invoice reference/i), {
        target: { value: 'PO-2026-303' },
      });

      const submitBtn = screen.getByRole('button', { name: /record receipt/i });
      const cancelBtn = screen.getByRole('button', { name: /cancel/i });

      // Click submit
      fireEvent.click(submitBtn);

      // Pending state communicates busy status
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /recording.../i })).toBeDisabled();
      });
      expect(cancelBtn).toBeDisabled();

      // Try duplicate click: submit should be completely disabled
      fireEvent.click(screen.getByRole('button', { name: /recording.../i }));
      expect(inventoryApi.receiveStock).toHaveBeenCalledTimes(1);

      // Resolve mutation
      act(() => {
        resolveMutation({
          success: true,
          movementId: 'mov-1',
          balanceAfter: 20,
          occurredAt: '2026-09-08T00:00:00Z',
        });
      });
    });

    it('preserves valid form inputs on mutation error and allows immediate retry', async () => {
      (inventoryApi.receiveStock as jest.Mock)
        .mockRejectedValueOnce(new Error('Vendor PO number already received'))
        .mockResolvedValueOnce({
          success: true,
          movementId: 'mov-2',
          balanceAfter: 20,
          occurredAt: '2026-09-08T00:00:00Z',
        });

      const onOpenChange = jest.fn();

      render(
        <QueryClientProvider client={queryClient}>
          <ReceiveStockDialog product={MOCK_PRODUCT} open={true} onOpenChange={onOpenChange} />
        </QueryClientProvider>,
      );

      // Enter data
      fireEvent.change(screen.getByLabelText(/quantity received/i), { target: { value: '8' } });
      fireEvent.change(screen.getByLabelText(/po \/ invoice reference/i), {
        target: { value: 'PO-DUPLICATE' },
      });

      // Attempt 1: Fails
      fireEvent.click(screen.getByRole('button', { name: /record receipt/i }));

      // In-modal error alert is displayed
      await waitFor(() => {
        expect(screen.getByTestId('receive-stock-error-alert')).toBeInTheDocument();
        expect(screen.getByText('Vendor PO number already received')).toBeInTheDocument();
      });

      // Form inputs are preserved (not wiped!)
      expect(screen.getByDisplayValue('8')).toBeInTheDocument();
      expect(screen.getByDisplayValue('PO-DUPLICATE')).toBeInTheDocument();

      // Retry: User corrects reference and clicks submit again
      fireEvent.change(screen.getByLabelText(/po \/ invoice reference/i), {
        target: { value: 'PO-CORRECTED-99' },
      });
      fireEvent.click(screen.getByRole('button', { name: /record receipt/i }));

      await waitFor(() => {
        expect(inventoryApi.receiveStock).toHaveBeenCalledTimes(2);
        expect(inventoryApi.receiveStock).toHaveBeenLastCalledWith('prod-hardened-1', {
          quantity: 8,
          unitCost: 20,
          referenceNumber: 'PO-CORRECTED-99',
          notes: undefined,
        });
      });

      // Dialog closes successfully on recovery
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('blocks outside click / escape dismissal while submission is in-flight', async () => {
      const onOpenChange = jest.fn();

      (inventoryApi.receiveStock as jest.Mock).mockReturnValue(new Promise(() => {}));

      render(
        <QueryClientProvider client={queryClient}>
          <ReceiveStockDialog product={MOCK_PRODUCT} open={true} onOpenChange={onOpenChange} />
        </QueryClientProvider>,
      );

      fireEvent.change(screen.getByLabelText(/quantity received/i), { target: { value: '4' } });
      fireEvent.change(screen.getByLabelText(/po \/ invoice reference/i), {
        target: { value: 'PO-IN-FLIGHT' },
      });

      // Submit to enter pending state
      fireEvent.click(screen.getByRole('button', { name: /record receipt/i }));

      // Wait for async validation to pass and pending state to activate
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /recording.../i })).toBeDisabled();
      });

      // Simulate escape key on DialogContent
      const dialogContent = screen.getByTestId('receive-stock-dialog');
      fireEvent.keyDown(dialogContent, { key: 'Escape', code: 'Escape' });

      // onOpenChange should NOT be called to avoid leaving user in limbo
      expect(onOpenChange).not.toHaveBeenCalled();
    });
  });

  describe('3. ArchiveProductDialog Hardening & Error Handling', () => {
    it('renders in-modal error alert and permits retry on archive failure', async () => {
      (inventoryApi.archiveItem as jest.Mock)
        .mockRejectedValueOnce(new Error('Cannot archive product with pending active orders'))
        .mockResolvedValueOnce({
          ...MOCK_PRODUCT,
          status: InventoryItemStatus.ARCHIVED,
        });

      const onOpenChange = jest.fn();

      render(
        <QueryClientProvider client={queryClient}>
          <ArchiveProductDialog product={MOCK_PRODUCT} open={true} onOpenChange={onOpenChange} />
        </QueryClientProvider>,
      );

      // Submit archive
      fireEvent.click(screen.getByRole('button', { name: /archive product/i }));

      // Alert displays error inside modal
      await waitFor(() => {
        expect(screen.getByTestId('archive-product-error-alert')).toBeInTheDocument();
        expect(
          screen.getByText('Cannot archive product with pending active orders'),
        ).toBeInTheDocument();
      });

      // Dialog is still open, user can retry
      expect(onOpenChange).not.toHaveBeenCalledWith(false);

      // Retry click
      fireEvent.click(screen.getByRole('button', { name: /archive product/i }));

      await waitFor(() => {
        expect(inventoryApi.archiveItem).toHaveBeenCalledTimes(2);
        expect(onOpenChange).toHaveBeenCalledWith(false);
      });
    });
  });
});
