import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ReceiveStockDialog,
  SellStockDialog,
  ConsumeStockDialog,
  AdjustStockDialog,
  ScrapStockDialog,
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
}));

const MOCK_PRODUCT: InventoryProductVM = {
  id: 'prod-456',
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

describe('Stock Mutation Transactional Dialogs & Interaction Architecture', () => {
  let queryClient: QueryClient;
  const mockReceiveMutate = jest.fn();
  const mockSellMutate = jest.fn();
  const mockConsumeMutate = jest.fn();
  const mockAdjustMutate = jest.fn();
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

    (inventoryMutations.useConsumeStock as jest.Mock).mockReturnValue({
      mutate: mockConsumeMutate,
      isPending: false,
    });

    (inventoryMutations.useAdjustStock as jest.Mock).mockReturnValue({
      mutate: mockAdjustMutate,
      isPending: false,
    });

    (inventoryMutations.useScrapStock as jest.Mock).mockReturnValue({
      mutate: mockScrapMutate,
      isPending: false,
    });
  });

  const renderWithQuery = (ui: React.ReactElement) => {
    return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
  };

  describe('1. SellStockDialog (Retail Point-of-Sale)', () => {
    it('renders informational stock on hand and submits valid sale', async () => {
      mockSellMutate.mockImplementation((_payload, options) => {
        options?.onSuccess?.();
      });
      const onOpenChange = jest.fn();
      const onSuccess = jest.fn();

      renderWithQuery(
        <SellStockDialog
          product={MOCK_PRODUCT}
          open={true}
          onOpenChange={onOpenChange}
          onSuccess={onSuccess}
        />,
      );

      // Verify informational stock is displayed
      expect(screen.getByText(/Available on hand:/i)).toBeInTheDocument();
      expect(screen.getByText(/20 Units/i)).toBeInTheDocument();
      expect(screen.getByDisplayValue('29.99')).toBeInTheDocument(); // default retail price

      // Fill in quantity and reference
      fireEvent.change(screen.getByLabelText(/units sold/i), { target: { value: '3' } });
      fireEvent.change(screen.getByLabelText(/pos receipt \/ member id/i), {
        target: { value: 'REC-2026-8801' },
      });

      fireEvent.click(screen.getByRole('button', { name: /record sale/i }));

      await waitFor(() => {
        expect(mockSellMutate).toHaveBeenCalledWith(
          {
            id: 'prod-456',
            payload: {
              quantity: 3,
              unitPrice: 29.99,
              referenceId: 'REC-2026-8801',
              notes: undefined,
            },
          },
          expect.any(Object),
        );
      });

      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(onSuccess).toHaveBeenCalled();
    });

    it('reconciles cache and displays alert on insufficient stock rejection', async () => {
      mockSellMutate.mockImplementation((_payload, options) => {
        options?.onError?.(new Error('Insufficient stock on hand to fulfill sale'));
      });
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      renderWithQuery(
        <SellStockDialog product={MOCK_PRODUCT} open={true} onOpenChange={jest.fn()} />,
      );

      fireEvent.change(screen.getByLabelText(/units sold/i), { target: { value: '25' } });
      fireEvent.click(screen.getByRole('button', { name: /record sale/i }));

      await waitFor(() => {
        expect(screen.getByTestId('sell-stock-error-alert')).toBeInTheDocument();
        expect(screen.getByText('Insufficient stock on hand to fulfill sale')).toBeInTheDocument();
      });

      // Verifies query reconciliation occurred
      expect(invalidateSpy).toHaveBeenCalled();
      // Form remains open and inputs preserved
      expect(screen.getByDisplayValue('25')).toBeInTheDocument();
    });
  });

  describe('2. ConsumeStockDialog (Clinical Treatment Consumption)', () => {
    it('submits clinical treatment usage with session cross-reference', async () => {
      mockConsumeMutate.mockImplementation((_payload, options) => {
        options?.onSuccess?.();
      });
      const onOpenChange = jest.fn();

      renderWithQuery(
        <ConsumeStockDialog product={MOCK_PRODUCT} open={true} onOpenChange={onOpenChange} />,
      );

      fireEvent.change(screen.getByLabelText(/units consumed/i), { target: { value: '2' } });
      fireEvent.change(screen.getByLabelText(/treatment \/ appointment id/i), {
        target: { value: 'APT-2026-4421' },
      });
      fireEvent.change(screen.getByLabelText(/clinical notes/i), {
        target: { value: 'Applied during recovery protocol' },
      });

      fireEvent.click(screen.getByRole('button', { name: /record consumption/i }));

      await waitFor(() => {
        expect(mockConsumeMutate).toHaveBeenCalledWith(
          {
            id: 'prod-456',
            payload: {
              quantity: 2,
              treatmentSessionId: 'APT-2026-4421',
              notes: 'Applied during recovery protocol',
            },
          },
          expect.any(Object),
        );
      });
    });
  });

  describe('3. ScrapStockDialog (Damaged / Expired Disposal)', () => {
    it('enforces mandatory audit reason and submits disposal', async () => {
      mockScrapMutate.mockImplementation((_payload, options) => {
        options?.onSuccess?.();
      });

      renderWithQuery(
        <ScrapStockDialog product={MOCK_PRODUCT} open={true} onOpenChange={jest.fn()} />,
      );

      fireEvent.change(screen.getByLabelText(/units disposed/i), { target: { value: '1' } });
      fireEvent.change(screen.getByLabelText(/disposal reason/i), {
        target: { value: 'Seal damaged during warehouse handling' },
      });

      fireEvent.click(screen.getByRole('button', { name: /record disposal/i }));

      await waitFor(() => {
        expect(mockScrapMutate).toHaveBeenCalledWith(
          {
            id: 'prod-456',
            payload: {
              quantity: 1,
              reason: 'Seal damaged during warehouse handling',
            },
          },
          expect.any(Object),
        );
      });
    });
  });

  describe('4. AdjustStockDialog (Audit Cycle Count)', () => {
    it('calculates live projected balance and disables invalid negative overdrafts', async () => {
      renderWithQuery(
        <AdjustStockDialog product={MOCK_PRODUCT} open={true} onOpenChange={jest.fn()} />,
      );

      // Initial balance: both Current and Projected are 20 UNITS
      expect(screen.getAllByText(/20\s+UNITS/i)).toHaveLength(2);

      // Enter delta: -5 -> projected: 15
      fireEvent.change(screen.getByLabelText(/delta units/i), { target: { value: '-5' } });
      expect(screen.getByText(/15\s+UNITS/i)).toBeInTheDocument();

      // Enter delta causing negative stock: -25 -> projected: -5
      fireEvent.change(screen.getByLabelText(/delta units/i), { target: { value: '-25' } });
      expect(screen.getByText(/-5\s+UNITS/i)).toBeInTheDocument();
      // Button disabled
      expect(screen.getByRole('button', { name: /record adjustment/i })).toBeDisabled();
    });

    it('submits valid audit adjustment with mandatory justification', async () => {
      mockAdjustMutate.mockImplementation((_payload, options) => {
        options?.onSuccess?.();
      });

      renderWithQuery(
        <AdjustStockDialog product={MOCK_PRODUCT} open={true} onOpenChange={jest.fn()} />,
      );

      fireEvent.change(screen.getByLabelText(/delta units/i), { target: { value: '2' } });
      fireEvent.change(screen.getByLabelText(/audit reason/i), {
        target: { value: 'Found 2 unrecorded units in storage bay 4' },
      });

      fireEvent.click(screen.getByRole('button', { name: /record adjustment/i }));

      await waitFor(() => {
        expect(mockAdjustMutate).toHaveBeenCalledWith(
          {
            id: 'prod-456',
            payload: {
              deltaQuantity: 2,
              reason: 'Found 2 unrecorded units in storage bay 4',
            },
          },
          expect.any(Object),
        );
      });
    });
  });

  describe('5. ReceiveStockDialog (Inbound Supply Receipt)', () => {
    it('submits delivery receipt with supplier reference and batch unit cost', async () => {
      mockReceiveMutate.mockImplementation((_payload, options) => {
        options?.onSuccess?.();
      });

      renderWithQuery(
        <ReceiveStockDialog product={MOCK_PRODUCT} open={true} onOpenChange={jest.fn()} />,
      );

      fireEvent.change(screen.getByLabelText(/quantity received/i), { target: { value: '50' } });
      fireEvent.change(screen.getByLabelText(/batch unit cost/i), { target: { value: '14.50' } });
      fireEvent.change(screen.getByLabelText(/po \/ invoice reference/i), {
        target: { value: 'PO-2026-9902' },
      });

      fireEvent.click(screen.getByRole('button', { name: /record receipt/i }));

      await waitFor(() => {
        expect(mockReceiveMutate).toHaveBeenCalledWith(
          {
            id: 'prod-456',
            payload: {
              quantity: 50,
              unitCost: 14.5,
              referenceNumber: 'PO-2026-9902',
              notes: undefined,
            },
          },
          expect.any(Object),
        );
      });
    });
  });
});
