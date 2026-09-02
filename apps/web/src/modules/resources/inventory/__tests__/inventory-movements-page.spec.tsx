import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InventoryMovementsPage } from '../routes/inventory-movements-page';
import * as inventoryQueries from '../hooks/use-inventory-queries';
import {
  InventoryCategory,
  InventoryItemStatus,
  StockMovementType,
  UnitOfMeasure,
} from '@kinergy-platform/core';
import type { InventoryProductVM, PaginatedStockMovementsVM } from '../types';

if (typeof global.Request === 'undefined') {
  global.Request = class Request {} as unknown as typeof Request;
}

jest.mock('../hooks/use-inventory-queries', () => ({
  useInventoryProduct: jest.fn(),
  useStockMovements: jest.fn(),
}));

const MOCK_PRODUCT: InventoryProductVM = {
  id: 'prod-100',
  sku: 'PROT-WHEY-1KG',
  name: 'Vanilla Whey Isolate 1kg',
  description: 'Pure micro-filtered whey protein isolate powder.',
  category: InventoryCategory.SUPPLEMENTS,
  unitCost: { amount: 25.0, currency: 'USD' },
  sellingPrice: { amount: 49.99, currency: 'USD' },
  currentStock: 45,
  reorderThreshold: 10,
  unitOfMeasure: UnitOfMeasure.UNITS,
  status: InventoryItemStatus.ACTIVE,
  isLowStock: false,
  isOutOfStock: false,
  createdAt: '2026-08-01T12:00:00.000Z',
  updatedAt: '2026-09-01T15:30:00.000Z',
};

const MOCK_MOVEMENTS_DATA: PaginatedStockMovementsVM = {
  items: [
    {
      id: 'mov-001',
      itemId: 'prod-100',
      type: StockMovementType.PURCHASE,
      quantity: 50,
      previousBalance: 0,
      newBalance: 50,
      unitCost: { amount: 25.0, currency: 'USD' },
      sellingPrice: null,
      referenceNumber: 'PO-2026-001',
      reason: 'Initial stock intake from supplier',
      actorId: 'user-admin-1',
      occurredAt: '2026-08-01T12:00:00.000Z',
    },
    {
      id: 'mov-002',
      itemId: 'prod-100',
      type: StockMovementType.SALE,
      quantity: 5,
      previousBalance: 50,
      newBalance: 45,
      unitCost: null,
      sellingPrice: { amount: 49.99, currency: 'USD' },
      referenceNumber: 'REC-2026-089',
      reason: 'Front desk retail sale to member',
      actorId: 'user-receptionist-1',
      occurredAt: '2026-08-05T14:30:00.000Z',
    },
  ],
  total: 2,
  page: 1,
  limit: 10,
  totalPages: 1,
};

describe('InventoryMovementsPage (Audit & Operational History Experience)', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    jest.clearAllMocks();

    (inventoryQueries.useInventoryProduct as jest.Mock).mockReturnValue({
      data: MOCK_PRODUCT,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    (inventoryQueries.useStockMovements as jest.Mock).mockReturnValue({
      data: MOCK_MOVEMENTS_DATA,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });
  });

  const renderComponent = (initialEntry = '/resources/inventory/prod-100/movements') => {
    const router = createMemoryRouter(
      [
        {
          path: '/resources/inventory/:id/movements',
          element: <InventoryMovementsPage />,
        },
        {
          path: '/resources/inventory/:id',
          element: <div data-testid="product-detail-view">Product Detail Target</div>,
        },
      ],
      {
        initialEntries: [initialEntry],
      },
    );

    return render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
  };

  it('renders product identity context, operational story summary, and chronological transactions', () => {
    renderComponent();

    // Product identity context
    expect(screen.getByText('Stock Movement Ledger')).toBeInTheDocument();
    expect(screen.getAllByText('PROT-WHEY-1KG')).toHaveLength(2);
    expect(screen.getByText(/Vanilla Whey Isolate 1kg/i)).toBeInTheDocument();

    // Operational Story summary
    expect(screen.getByTestId('movement-history-summary')).toBeInTheDocument();
    expect(screen.getAllByText('+50')).toHaveLength(2); // Inbound summary total + row 1 delta
    expect(screen.getAllByText('-5')).toHaveLength(2); // Outbound summary total + row 2 delta

    // Transaction rows
    const row1 = screen.getByTestId('movement-row-mov-001');
    const row2 = screen.getByTestId('movement-row-mov-002');
    expect(row1).toBeInTheDocument();
    expect(row2).toBeInTheDocument();

    // Operational details in row 1
    expect(row1).toHaveTextContent('Purchase (+)');
    expect(row1).toHaveTextContent('+50');
    expect(row1).toHaveTextContent(/0\s*→\s*50/);
    expect(row1).toHaveTextContent('PO-2026-001');
    expect(row1).toHaveTextContent('Initial stock intake from supplier');
    expect(row1).toHaveTextContent('user-admin-1');

    // Operational details in row 2
    expect(row2).toHaveTextContent('Retail Sale (-)');
    expect(row2).toHaveTextContent('-5');
    expect(row2).toHaveTextContent(/50\s*→\s*45/);
    expect(row2).toHaveTextContent('REC-2026-089');
    expect(row2).toHaveTextContent('Front desk retail sale to member');
    expect(row2).toHaveTextContent('user-receptionist-1');
  });

  it('allows filtering by movement type and updates the query parameters', async () => {
    renderComponent();

    // Filter bar should be present
    expect(screen.getByTestId('movement-history-filter-bar')).toBeInTheDocument();

    // Click on "Purchases (+)" filter chip
    const purchaseChip = screen.getByTestId('filter-chip-PURCHASE');
    fireEvent.click(purchaseChip);

    await waitFor(() => {
      expect(inventoryQueries.useStockMovements).toHaveBeenCalledWith(
        'prod-100',
        expect.objectContaining({
          movementType: StockMovementType.PURCHASE,
        }),
      );
    });

    // Reset button should now be visible
    const resetBtn = screen.getByTestId('reset-movement-filters-btn');
    expect(resetBtn).toBeInTheDocument();

    // Click Reset
    fireEvent.click(resetBtn);

    await waitFor(() => {
      expect(inventoryQueries.useStockMovements).toHaveBeenCalledWith(
        'prod-100',
        expect.objectContaining({
          movementType: undefined,
        }),
      );
    });
  });

  it('restores filter state from URL parameters deterministically', () => {
    renderComponent('/resources/inventory/prod-100/movements?movementType=SALE&page=2');

    expect(inventoryQueries.useStockMovements).toHaveBeenCalledWith(
      'prod-100',
      expect.objectContaining({
        movementType: StockMovementType.SALE,
        page: 2,
      }),
    );
  });

  it('handles pagination navigation when multiple pages exist', async () => {
    (inventoryQueries.useStockMovements as jest.Mock).mockReturnValue({
      data: {
        items: MOCK_MOVEMENTS_DATA.items,
        total: 25,
        page: 1,
        limit: 10,
        totalPages: 3,
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    renderComponent();

    expect(screen.getByTestId('movements-pagination')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();

    const nextBtn = screen.getByTestId('pagination-next-btn');
    expect(nextBtn).toBeEnabled();
    const prevBtn = screen.getByTestId('pagination-prev-btn');
    expect(prevBtn).toBeDisabled();

    fireEvent.click(nextBtn);

    await waitFor(() => {
      expect(inventoryQueries.useStockMovements).toHaveBeenCalledWith(
        'prod-100',
        expect.objectContaining({
          page: 2,
        }),
      );
    });
  });

  it('differentiates initial empty state from filtered empty state', () => {
    // 1. Initial Empty State (product has never had movements)
    (inventoryQueries.useStockMovements as jest.Mock).mockReturnValue({
      data: {
        items: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    const { unmount } = renderComponent();
    expect(screen.getByTestId('movements-empty')).toBeInTheDocument();
    expect(screen.getByText(/No Movement Ledger Records/i)).toBeInTheDocument();
    unmount();

    // 2. Filtered Empty State (user filtered by SCRAP and got 0 results)
    renderComponent('/resources/inventory/prod-100/movements?movementType=SCRAP');
    expect(screen.getByTestId('movements-filtered-empty')).toBeInTheDocument();
    expect(screen.getByText(/No matching movements found/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /clear movement filters/i })).toBeInTheDocument();
  });

  it('renders query error state with retry option when movements fetch fails', () => {
    const mockRefetch = jest.fn();
    (inventoryQueries.useStockMovements as jest.Mock).mockReturnValue({
      data: null,
      isLoading: false,
      isError: true,
      error: new Error('Network timeout connecting to inventory ledger'),
      refetch: mockRefetch,
    });

    renderComponent();

    expect(screen.getByTestId('movements-error')).toBeInTheDocument();
    expect(screen.getByText('Network timeout connecting to inventory ledger')).toBeInTheDocument();

    const retryBtn = screen.getByRole('button', { name: /retry query/i });
    fireEvent.click(retryBtn);
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('allows navigation back to the product detail view', () => {
    renderComponent();

    const backLink = screen.getByTestId('back-to-product-link');
    expect(backLink).toBeInTheDocument();
    expect(backLink).toHaveAttribute('href', '/resources/inventory/prod-100');
  });
});
