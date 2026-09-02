import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InventoryEditPage } from '../routes/inventory-edit-page';
import * as inventoryQueries from '../hooks/use-inventory-queries';
import * as inventoryMutations from '../hooks/use-inventory-mutations';
import { InventoryCategory, InventoryItemStatus, UnitOfMeasure } from '@kinergy-platform/core';
import type { InventoryProductVM } from '../types';

// Polyfill Request if undefined in jsdom for React Router Data Router
if (typeof global.Request === 'undefined') {
  global.Request = class Request {} as unknown as typeof Request;
}

jest.mock('../hooks/use-inventory-queries', () => ({
  useInventoryProduct: jest.fn(),
}));

jest.mock('../hooks/use-inventory-mutations', () => ({
  useUpdateProduct: jest.fn(),
  useArchiveProduct: jest.fn(),
}));

const MOCK_PRODUCT: InventoryProductVM = {
  id: 'prod-456',
  sku: 'PROT-ISOLATE-1KG',
  name: 'Vanilla Whey Isolate 1kg',
  description: 'Pure micro-filtered whey protein isolate powder.',
  category: InventoryCategory.SUPPLEMENTS,
  unitCost: { amount: 28.5, currency: 'USD' },
  sellingPrice: { amount: 54.99, currency: 'USD' },
  currentStock: 42,
  reorderThreshold: 10,
  unitOfMeasure: UnitOfMeasure.UNITS,
  status: InventoryItemStatus.ACTIVE,
  isLowStock: false,
  isOutOfStock: false,
  createdAt: '2026-08-15T10:00:00.000Z',
  updatedAt: '2026-09-01T14:30:00.000Z',
};

describe('InventoryEditPage & ProductEditForm', () => {
  let queryClient: QueryClient;
  const mockUpdateMutate = jest.fn();
  const mockArchiveMutate = jest.fn();

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    jest.clearAllMocks();

    (inventoryQueries.useInventoryProduct as jest.Mock).mockReturnValue({
      data: MOCK_PRODUCT,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    (inventoryMutations.useUpdateProduct as jest.Mock).mockReturnValue({
      mutate: mockUpdateMutate,
      isPending: false,
      error: null,
    });

    (inventoryMutations.useArchiveProduct as jest.Mock).mockReturnValue({
      mutate: mockArchiveMutate,
      isPending: false,
      error: null,
    });
  });

  const renderComponent = (initialEntry = '/resources/inventory/prod-456/edit') => {
    const router = createMemoryRouter(
      [
        {
          path: '/resources/inventory/:id/edit',
          element: <InventoryEditPage />,
        },
        {
          path: '/resources/inventory',
          element: <div>Catalog Page Content</div>,
        },
        {
          path: '/resources/inventory/:id',
          element: <div>Detail Page Content</div>,
        },
      ],
      { initialEntries: [initialEntry] },
    );

    return render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
  };

  it('renders loading skeleton when product data is loading', () => {
    (inventoryQueries.useInventoryProduct as jest.Mock).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    renderComponent();

    expect(screen.getByTestId('inventory-edit-loading')).toBeInTheDocument();
  });

  it('renders not found state when product does not exist', () => {
    (inventoryQueries.useInventoryProduct as jest.Mock).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Product not found'),
      refetch: jest.fn(),
    });

    renderComponent();

    expect(screen.getByTestId('inventory-edit-error')).toBeInTheDocument();
    expect(screen.getByText('Product Not Found')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /return to catalog/i })).toBeInTheDocument();
  });

  it('hydrates form with authoritative product metadata', () => {
    renderComponent();

    expect(screen.getByDisplayValue('Vanilla Whey Isolate 1kg')).toBeInTheDocument();
    expect(
      screen.getByDisplayValue('Pure micro-filtered whey protein isolate powder.'),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue('28.5')).toBeInTheDocument();
    expect(screen.getByDisplayValue('54.99')).toBeInTheDocument();
    expect(screen.getByDisplayValue('10')).toBeInTheDocument();
  });

  it('renders SKU as immutable and does not allow stock on hand to be edited via form input', () => {
    renderComponent();

    // 1. SKU is displayed with Immutable badge
    expect(screen.getAllByText('PROT-ISOLATE-1KG')[0]).toBeInTheDocument();
    expect(screen.getByText('Immutable')).toBeInTheDocument();

    // 2. Physical Stock on Hand is rendered in audit banner, NOT as an editable input
    const stockBanner = screen.getByTestId('stock-ledger-audit-banner');
    expect(stockBanner).toBeInTheDocument();
    expect(screen.getByText('Physical Stock on Hand')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText(/Ledger Integrity Invariant:/i)).toBeInTheDocument();

    // Verify there is no input labeled "Current Stock" or "Quantity on Hand"
    expect(screen.queryByLabelText(/initial opening stock/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/current physical stock/i)).not.toBeInTheDocument();
  });

  it('submits updated values, calls update mutation, and navigates on success', async () => {
    mockUpdateMutate.mockImplementation((_payload, options) => {
      setTimeout(() => {
        options?.onSuccess?.({
          id: 'prod-456',
          name: 'Vanilla Whey Isolate 1kg - Revised Formula',
        });
      }, 0);
    });

    renderComponent();

    const nameInput = screen.getByLabelText(/product name/i);
    const unitCostInput = screen.getByLabelText(/unit purchase cost/i);
    const sellingPriceInput = screen.getByLabelText(/retail selling price/i);
    const thresholdInput = screen.getByLabelText(/reorder threshold/i);

    fireEvent.change(nameInput, {
      target: { value: 'Vanilla Whey Isolate 1kg - Revised Formula' },
    });
    fireEvent.change(unitCostInput, { target: { value: '31.00' } });
    fireEvent.change(sellingPriceInput, { target: { value: '59.99' } });
    fireEvent.change(thresholdInput, { target: { value: '15' } });

    const saveBtn = screen.getByRole('button', { name: /save changes/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockUpdateMutate).toHaveBeenCalledWith(
        {
          id: 'prod-456',
          payload: {
            name: 'Vanilla Whey Isolate 1kg - Revised Formula',
            description: 'Pure micro-filtered whey protein isolate powder.',
            category: InventoryCategory.SUPPLEMENTS,
            unitOfMeasure: UnitOfMeasure.UNITS,
            unitCost: 31,
            sellingPrice: 59.99,
            reorderThreshold: 15,
          },
        },
        expect.any(Object),
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Detail Page Content')).toBeInTheDocument();
    });
  });

  it('displays backend validation error when update fails', () => {
    (inventoryMutations.useUpdateProduct as jest.Mock).mockReturnValue({
      mutate: mockUpdateMutate,
      isPending: false,
      error: new Error('Product title conflict on server'),
    });

    renderComponent();

    expect(screen.getByText('Product title conflict on server')).toBeInTheDocument();
  });

  it('intercepts navigation with ConfirmDiscardDialog when changes are unsaved', async () => {
    renderComponent();

    const nameInput = screen.getByLabelText(/product name/i);
    fireEvent.change(nameInput, { target: { value: 'Draft modification that is unsaved' } });

    const backLink = screen.getByRole('link', { name: /back to product/i });
    fireEvent.click(backLink);

    await waitFor(() => {
      expect(screen.getByText('Discard unsaved changes?')).toBeInTheDocument();
    });

    // Cancel keep editing
    const keepEditingBtn = screen.getByRole('button', { name: /keep editing/i });
    fireEvent.click(keepEditingBtn);

    await waitFor(() => {
      expect(screen.queryByText('Discard unsaved changes?')).not.toBeInTheDocument();
      expect(screen.getByDisplayValue('Draft modification that is unsaved')).toBeInTheDocument();
    });
  });

  it('opens archive confirmation dialog and calls archive mutation on confirm', async () => {
    mockArchiveMutate.mockImplementation((_id, options) => {
      setTimeout(() => {
        options?.onSuccess?.();
      }, 0);
    });

    renderComponent();

    // Click Archive Product button in danger zone
    const openArchiveBtn = screen.getByRole('button', { name: /archive product/i });
    fireEvent.click(openArchiveBtn);

    await waitFor(() => {
      expect(screen.getByTestId('archive-product-dialog')).toBeInTheDocument();
      expect(screen.getByText('Archive Consumable Product')).toBeInTheDocument();
      expect(screen.getByText(/Catalog Lifecycle Impact/i)).toBeInTheDocument();
    });

    // Confirm Archive in dialog
    const confirmArchiveBtns = screen.getAllByRole('button', { name: /archive product/i });
    const confirmArchiveBtn = confirmArchiveBtns[confirmArchiveBtns.length - 1]!;
    fireEvent.click(confirmArchiveBtn);

    await waitFor(() => {
      expect(mockArchiveMutate).toHaveBeenCalledWith('prod-456', expect.any(Object));
    });
  });
});
