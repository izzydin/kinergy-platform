import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InventoryDetailPage } from '../routes/inventory-detail-page';
import * as inventoryQueries from '../hooks/use-inventory-queries';
import * as inventoryMutations from '../hooks/use-inventory-mutations';
import * as authProvider from '../../../../app/providers/auth-provider';
import {
  InventoryCategory,
  InventoryItemStatus,
  StockMovementType,
  UnitOfMeasure,
} from '@kinergy-platform/core';
import type { InventoryProductVM, PaginatedStockMovementsVM } from '../types';

// Polyfill Request if undefined in jsdom for React Router Data Router
if (typeof global.Request === 'undefined') {
  global.Request = class Request {} as unknown as typeof Request;
}

jest.mock('../hooks/use-inventory-queries', () => ({
  useInventoryProduct: jest.fn(),
  useStockMovements: jest.fn(),
}));

jest.mock('../hooks/use-inventory-mutations', () => ({
  useReceiveStock: jest.fn(),
  useSellStock: jest.fn(),
  useConsumeStock: jest.fn(),
  useAdjustStock: jest.fn(),
  useScrapStock: jest.fn(),
  useArchiveProduct: jest.fn(),
}));

jest.mock('../../../../app/providers/auth-provider', () => ({
  useAuth: jest.fn(),
}));

const MOCK_IN_STOCK_PRODUCT: InventoryProductVM = {
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

const MOCK_LOW_STOCK_PRODUCT: InventoryProductVM = {
  ...MOCK_IN_STOCK_PRODUCT,
  id: 'prod-101',
  currentStock: 8,
  reorderThreshold: 10,
  isLowStock: true,
  isOutOfStock: false,
};

const MOCK_OUT_OF_STOCK_PRODUCT: InventoryProductVM = {
  ...MOCK_IN_STOCK_PRODUCT,
  id: 'prod-102',
  currentStock: 0,
  reorderThreshold: 10,
  isLowStock: true,
  isOutOfStock: true,
};

const MOCK_MOVEMENTS: PaginatedStockMovementsVM = {
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
      reason: 'Initial supplier delivery batch',
      actorId: 'usr-admin',
      occurredAt: '2026-08-01T12:30:00.000Z',
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
      referenceNumber: 'POS-REC-991',
      reason: 'Retail purchase',
      actorId: 'usr-cashier',
      occurredAt: '2026-08-05T14:15:00.000Z',
    },
  ],
  total: 2,
  page: 1,
  limit: 5,
  totalPages: 1,
};

describe('InventoryDetailPage', () => {
  let queryClient: QueryClient;
  const mockRefetch = jest.fn();

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    jest.clearAllMocks();

    // Default: Admin user with full permissions
    (authProvider.useAuth as jest.Mock).mockReturnValue({
      hasPermission: jest.fn(
        (perm) =>
          perm === 'inventory.read' || perm === 'inventory.write' || perm === 'valuation.read',
      ),
      hasRole: jest.fn((role) => role === 'ADMIN'),
    });

    (inventoryQueries.useInventoryProduct as jest.Mock).mockReturnValue({
      data: MOCK_IN_STOCK_PRODUCT,
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    (inventoryQueries.useStockMovements as jest.Mock).mockReturnValue({
      data: MOCK_MOVEMENTS,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    (inventoryMutations.useReceiveStock as jest.Mock).mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
    });

    (inventoryMutations.useSellStock as jest.Mock).mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
    });

    (inventoryMutations.useConsumeStock as jest.Mock).mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
    });

    (inventoryMutations.useAdjustStock as jest.Mock).mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
    });

    (inventoryMutations.useScrapStock as jest.Mock).mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
    });

    (inventoryMutations.useArchiveProduct as jest.Mock).mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
    });
  });

  const renderComponent = (initialEntry = '/resources/inventory/prod-100') => {
    const router = createMemoryRouter(
      [
        {
          path: '/resources/inventory/:id',
          element: <InventoryDetailPage />,
        },
        {
          path: '/resources/inventory',
          element: <div>Catalog Page Content</div>,
        },
        {
          path: '/resources/inventory/:id/edit',
          element: <div>Edit Page Content</div>,
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

  it('renders loading skeleton when product query is loading', () => {
    (inventoryQueries.useInventoryProduct as jest.Mock).mockReturnValue({
      data: undefined,
      isLoading: true,
      isFetching: true,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    renderComponent();

    expect(screen.getByTestId('inventory-detail-loading')).toBeInTheDocument();
  });

  it('renders not-found state when product is missing', () => {
    (inventoryQueries.useInventoryProduct as jest.Mock).mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: false,
      isError: true,
      error: new Error('Catalog item not found'),
      refetch: mockRefetch,
    });

    renderComponent();

    expect(screen.getByTestId('inventory-detail-error')).toBeInTheDocument();
    expect(screen.getByText('Product Not Found')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /return to catalog/i })).toBeInTheDocument();
  });

  it('renders full product details and stock status for an in-stock item', () => {
    renderComponent();

    // 1. Title & Badges
    expect(
      screen.getByRole('heading', { level: 1, name: /Vanilla Whey Isolate 1kg/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('SKU: PROT-WHEY-1KG')).toBeInTheDocument();

    // 2. Physical Stock Hero
    expect(screen.getByTestId('current-stock-value')).toHaveTextContent('45');
    expect(screen.getByText(/Adequate Stock Balance/i)).toBeInTheDocument();

    // 3. Commercial Pricing
    expect(screen.getByText('$49.99')).toBeInTheDocument(); // retail selling price
    expect(screen.getByText('$25.00')).toBeInTheDocument(); // unit acquisition cost
    expect(screen.getByText(/Current Working Capital Value:/i)).toBeInTheDocument();
    expect(screen.getByText('$1125.00 USD')).toBeInTheDocument(); // 45 * 25

    // 4. Metadata
    expect(
      screen.getByText('Pure micro-filtered whey protein isolate powder.'),
    ).toBeInTheDocument();
  });

  it('renders low-stock warning banner when balance is at or below threshold', () => {
    (inventoryQueries.useInventoryProduct as jest.Mock).mockReturnValue({
      data: MOCK_LOW_STOCK_PRODUCT,
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    renderComponent();

    expect(screen.getByTestId('status-low-stock-alert')).toBeInTheDocument();
    expect(screen.getByText('Low Stock Alert')).toBeInTheDocument();
    expect(screen.getByText(/Below Reorder Point/i)).toBeInTheDocument();
    expect(screen.queryByTestId('status-out-of-stock-alert')).not.toBeInTheDocument();
  });

  it('renders zero stock warning when product is completely depleted (out of stock)', () => {
    (inventoryQueries.useInventoryProduct as jest.Mock).mockReturnValue({
      data: MOCK_OUT_OF_STOCK_PRODUCT,
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    renderComponent();

    expect(screen.getByTestId('status-out-of-stock-alert')).toBeInTheDocument();
    expect(screen.getByText('Zero Physical Stock Available')).toBeInTheDocument();
    expect(screen.getByText(/Depleted \(0 on hand\)/i)).toBeInTheDocument();
    expect(screen.queryByTestId('status-low-stock-alert')).not.toBeInTheDocument();
  });

  it('masks unit purchase cost when user lacks valuation/billing permissions', () => {
    (authProvider.useAuth as jest.Mock).mockReturnValue({
      hasPermission: jest.fn((perm) => perm === 'inventory.read'), // lacks valuation.read
      hasRole: jest.fn(() => false), // not admin
    });

    renderComponent();

    const costContainer = screen.getByTestId('unit-cost-container');
    expect(costContainer).toHaveTextContent('••••••');
    expect(costContainer).toHaveTextContent('Restricted (valuation.read)');
    expect(screen.queryByText('$25.00')).not.toBeInTheDocument();
    expect(screen.queryByText(/Current Working Capital Value:/i)).not.toBeInTheDocument();
  });

  it('hides write actions from read-only staff without inventory.write', () => {
    (authProvider.useAuth as jest.Mock).mockReturnValue({
      hasPermission: jest.fn((perm) => perm === 'inventory.read'),
      hasRole: jest.fn(() => false),
    });

    renderComponent();

    expect(screen.queryByTestId('action-receive-stock')).not.toBeInTheDocument();
    expect(screen.queryByTestId('action-adjust-stock')).not.toBeInTheDocument();
    expect(screen.queryByTestId('action-edit-product')).not.toBeInTheDocument();
    expect(screen.queryByTestId('action-archive-product')).not.toBeInTheDocument();
  });

  it('renders recent stock movements ledger in preview card', () => {
    renderComponent();

    const movementsCard = screen.getByTestId('product-movements-preview');
    expect(movementsCard).toBeInTheDocument();
    expect(screen.getByText('Recent Movement Ledger')).toBeInTheDocument();
    const row1 = screen.getByTestId('movement-row-mov-001');
    const row2 = screen.getByTestId('movement-row-mov-002');
    expect(row1).toBeInTheDocument();
    expect(row2).toBeInTheDocument();
    expect(screen.getByText('+50')).toBeInTheDocument();
    expect(screen.getByText('-5')).toBeInTheDocument();
    expect(row1).toHaveTextContent('0 → 50');
    expect(row2).toHaveTextContent('50 → 45');
  });

  it('opens ReceiveStockDialog when Receive Stock action is clicked', async () => {
    renderComponent();

    const receiveBtn = screen.getByTestId('action-receive-stock');
    fireEvent.click(receiveBtn);

    await waitFor(() => {
      expect(screen.getByTestId('receive-stock-dialog')).toBeInTheDocument();
      expect(screen.getByText('Receive Inventory Batch')).toBeInTheDocument();
    });
  });

  it('opens AdjustStockDialog when Adjust Stock action is clicked', async () => {
    renderComponent();

    const adjustBtn = screen.getByTestId('action-adjust-stock');
    fireEvent.click(adjustBtn);

    await waitFor(() => {
      expect(screen.getByTestId('adjust-stock-dialog')).toBeInTheDocument();
      expect(screen.getByText('Physical Stock Count Adjustment')).toBeInTheDocument();
    });
  });

  it('opens ArchiveProductDialog when Archive action is clicked', async () => {
    renderComponent();

    const archiveBtn = screen.getByTestId('action-archive-product');
    fireEvent.click(archiveBtn);

    await waitFor(() => {
      expect(screen.getByTestId('archive-product-dialog')).toBeInTheDocument();
      expect(screen.getByText('Archive Consumable Product')).toBeInTheDocument();
    });
  });
});
