import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ArchiveProductDialog } from '../components/archive-product-dialog';
import { ScrapStockDialog } from '../components/scrap-stock-dialog';
import { inventoryApi } from '../api/inventory-api';
import { InventoryItemStatus, InventoryCategory } from '../types';
import type { InventoryProductVM } from '../types';

jest.mock('../api/inventory-api', () => ({
  inventoryApi: {
    archiveItem: jest.fn(),
    scrapStock: jest.fn(),
  },
  inventoryQueryKeys: {
    lists: () => ['resources', 'inventory', 'list'],
    lowStock: () => ['resources', 'inventory', 'low-stock'],
    valuation: () => ['resources', 'inventory', 'valuation'],
    detail: (id: string) => ['resources', 'inventory', 'detail', id],
    stock: (id: string) => ['resources', 'inventory', 'stock', id],
    movementsLists: (id: string) => ['resources', 'inventory', 'detail', id, 'movements'],
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

const MOCK_PRODUCT: InventoryProductVM = {
  id: 'prod-destruct-1',
  sku: 'EQUIP-BAND-001',
  name: 'Heavy Resistance Band',
  category: InventoryCategory.CLINICAL_SUPPLIES,
  description: 'High tensile latex therapy band',
  unitOfMeasure: 'UNITS',
  currentStock: 24,
  reorderThreshold: 5,
  unitCost: { amount: 8.5, currency: 'USD' },
  sellingPrice: { amount: 16.0, currency: 'USD' },
  status: InventoryItemStatus.ACTIVE,
  isLowStock: false,
  isOutOfStock: false,
  createdAt: '2026-01-15T08:00:00Z',
  updatedAt: '2026-01-15T08:00:00Z',
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

describe('Destructive Actions Confirmation Audit — Consumable Inventory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('1. ArchiveProductDialog Hardened Confirmation Gate', () => {
    it('1.1 opens and communicates business-specific context without vague "Are you sure?" phrasing', () => {
      renderWithClient(
        <ArchiveProductDialog product={MOCK_PRODUCT} open={true} onOpenChange={jest.fn()} />,
      );

      // Dialog is open with accessible title
      expect(screen.getByTestId('archive-product-dialog')).toBeInTheDocument();
      expect(
        screen.getByRole('heading', { name: /archive consumable product/i }),
      ).toBeInTheDocument();

      // STRICT CHECK: Does NOT contain vague "Are you sure?" phrasing
      expect(screen.queryByText(/are you sure/i)).not.toBeInTheDocument();

      // Communicates (1) What will happen: Delisting from active POS and automated alerts
      expect(screen.getByText(/catalog lifecycle impact/i)).toBeInTheDocument();
      expect(
        screen.getByText(
          /removes this item from point-of-sale \(pos\) catalogs and automated restock alerts/i,
        ),
      ).toBeInTheDocument();

      // Communicates (2) Which resource is affected: Name, SKU, Category, and Current Balance
      const summary = screen.getByTestId('archive-resource-summary');
      expect(summary).toHaveTextContent('Heavy Resistance Band');
      expect(summary).toHaveTextContent('EQUIP-BAND-001');
      expect(summary).toHaveTextContent('CLINICAL_SUPPLIES');
      expect(summary).toHaveTextContent('Balance: 24 UNITS');

      // Communicates (3) Reversibility: Explicitly discloses reversible nature
      expect(screen.getByText(/reversible action/i)).toBeInTheDocument();
      expect(
        screen.getByText(/reactivated back to active catalog status at any time/i),
      ).toBeInTheDocument();

      // Communicates (4) What user must do to confirm
      expect(
        screen.getByText(/To proceed with delisting this item from active sales/i),
      ).toBeInTheDocument();
    });

    it('1.2 cancel action closes dialog without mutating', () => {
      const onOpenChange = jest.fn();
      renderWithClient(
        <ArchiveProductDialog product={MOCK_PRODUCT} open={true} onOpenChange={onOpenChange} />,
      );

      const cancelBtn = screen.getByTestId('archive-cancel-btn');
      fireEvent.click(cancelBtn);

      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(inventoryApi.archiveItem).not.toHaveBeenCalled();
    });

    it('1.3 confirm action invokes archive mutation with destructive semantics', async () => {
      (inventoryApi.archiveItem as jest.Mock).mockResolvedValueOnce({
        ...MOCK_PRODUCT,
        status: InventoryItemStatus.ARCHIVED,
      });

      const onOpenChange = jest.fn();
      const onArchived = jest.fn();

      renderWithClient(
        <ArchiveProductDialog
          product={MOCK_PRODUCT}
          open={true}
          onOpenChange={onOpenChange}
          onArchived={onArchived}
        />,
      );

      const confirmBtn = screen.getByTestId('archive-confirm-btn');
      // Destructive styling check
      expect(confirmBtn.className).toContain('bg-destructive');

      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(inventoryApi.archiveItem).toHaveBeenCalledWith('prod-destruct-1');
        expect(onOpenChange).toHaveBeenCalledWith(false);
        expect(onArchived).toHaveBeenCalled();
      });
    });

    it('1.4 Escape key cancels dialog when idle', () => {
      const onOpenChange = jest.fn();
      renderWithClient(
        <ArchiveProductDialog product={MOCK_PRODUCT} open={true} onOpenChange={onOpenChange} />,
      );

      const dialog = screen.getByTestId('archive-product-dialog');
      fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' });

      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(inventoryApi.archiveItem).not.toHaveBeenCalled();
    });

    it('1.5 pending state prevents duplicate confirmation and suppresses Escape cancellation', async () => {
      let resolvePromise: (val: unknown) => void = () => {};
      (inventoryApi.archiveItem as jest.Mock).mockReturnValue(
        new Promise((resolve) => {
          resolvePromise = resolve;
        }),
      );

      const onOpenChange = jest.fn();
      renderWithClient(
        <ArchiveProductDialog product={MOCK_PRODUCT} open={true} onOpenChange={onOpenChange} />,
      );

      const confirmBtn = screen.getByTestId('archive-confirm-btn');
      const cancelBtn = screen.getByTestId('archive-cancel-btn');

      // Click 1: begins mutation
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(confirmBtn).toBeDisabled();
        expect(cancelBtn).toBeDisabled();
        expect(screen.getByText(/archiving\.\.\./i)).toBeInTheDocument();
      });

      // Duplicate click attempt while pending
      fireEvent.click(confirmBtn);
      expect(inventoryApi.archiveItem).toHaveBeenCalledTimes(1);

      // Escape attempt while pending is suppressed
      const dialog = screen.getByTestId('archive-product-dialog');
      fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' });
      expect(onOpenChange).not.toHaveBeenCalled();

      // Resolve mutation cleanly
      resolvePromise({ ...MOCK_PRODUCT, status: InventoryItemStatus.ARCHIVED });
      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(false);
      });
    });
  });

  describe('2. ScrapStockDialog Hardened Irreversible Write-Off Confirmation', () => {
    it('2.1 discloses irreversible financial and physical inventory write-off impact', () => {
      renderWithClient(
        <ScrapStockDialog product={MOCK_PRODUCT} open={true} onOpenChange={jest.fn()} />,
      );

      expect(screen.getByTestId('scrap-stock-dialog')).toBeInTheDocument();
      expect(screen.getByText(/irreversible inventory write-off/i)).toBeInTheDocument();
      expect(
        screen.getByText(
          /disposed units are permanently written off from stock and committed to the immutable audit ledger/i,
        ),
      ).toBeInTheDocument();
    });

    it('2.2 cancel action dismisses without mutating stock', () => {
      const onOpenChange = jest.fn();
      renderWithClient(
        <ScrapStockDialog product={MOCK_PRODUCT} open={true} onOpenChange={onOpenChange} />,
      );

      fireEvent.click(screen.getByTestId('scrap-cancel-btn'));
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(inventoryApi.scrapStock).not.toHaveBeenCalled();
    });

    it('2.3 confirm action submits with validation and destructive semantics', async () => {
      (inventoryApi.scrapStock as jest.Mock).mockResolvedValueOnce({
        id: 'scrap-result-1',
        productId: 'prod-destruct-1',
        quantity: 3,
        balanceAfter: 21,
      });

      const onOpenChange = jest.fn();
      const onSuccess = jest.fn();

      renderWithClient(
        <ScrapStockDialog
          product={MOCK_PRODUCT}
          open={true}
          onOpenChange={onOpenChange}
          onSuccess={onSuccess}
        />,
      );

      fireEvent.change(screen.getByLabelText(/units disposed/i), { target: { value: '3' } });
      fireEvent.change(screen.getByLabelText(/disposal reason/i), {
        target: { value: 'Severe elastic degradation detected on inspection' },
      });

      const confirmBtn = screen.getByTestId('scrap-confirm-btn');
      expect(confirmBtn.className).toContain('bg-destructive');

      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(inventoryApi.scrapStock).toHaveBeenCalledWith('prod-destruct-1', {
          quantity: 3,
          reason: 'Severe elastic degradation detected on inspection',
        });
        expect(onOpenChange).toHaveBeenCalledWith(false);
        expect(onSuccess).toHaveBeenCalled();
      });
    });

    it('2.4 pending state prevents duplicate submission', async () => {
      let resolvePromise: (val: unknown) => void = () => {};
      (inventoryApi.scrapStock as jest.Mock).mockReturnValue(
        new Promise((resolve) => {
          resolvePromise = resolve;
        }),
      );

      renderWithClient(
        <ScrapStockDialog product={MOCK_PRODUCT} open={true} onOpenChange={jest.fn()} />,
      );

      fireEvent.change(screen.getByLabelText(/units disposed/i), { target: { value: '2' } });
      fireEvent.change(screen.getByLabelText(/disposal reason/i), {
        target: { value: 'Contaminated packaging in storage' },
      });

      const confirmBtn = screen.getByTestId('scrap-confirm-btn');
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(confirmBtn).toBeDisabled();
        expect(screen.getByText(/scrapping\.\.\./i)).toBeInTheDocument();
      });

      // Second click is prevented
      fireEvent.click(confirmBtn);
      expect(inventoryApi.scrapStock).toHaveBeenCalledTimes(1);

      resolvePromise({ id: 'res', productId: 'prod-destruct-1' });
    });
  });
});
