import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LowStockPage } from '../routes/low-stock-page';
import * as authProvider from '../../../../app/providers/auth-provider';
import * as inventoryQueries from '../hooks/use-inventory-queries';
import * as inventoryMutations from '../hooks/use-inventory-mutations';
import { InventoryCategory, InventoryItemStatus, type InventoryProductVM } from '../types';

jest.mock('../../../../app/providers/auth-provider', () => {
  const actual = jest.requireActual('../../../../app/providers/auth-provider');
  return {
    ...actual,
    useAuth: jest.fn(),
  };
});

jest.mock('../hooks/use-inventory-queries', () => ({
  useLowStockItems: jest.fn(),
}));

jest.mock('../hooks/use-inventory-mutations', () => ({
  useReceiveStock: jest.fn(),
}));

describe('LowStockPage & LowStockAttentionQueue', () => {
  jest.setTimeout(15000);
  let queryClient: QueryClient;
  const mockRefetch = jest.fn();
  const mockReceiveMutate = jest.fn();

  const mockProductOutOfStock: InventoryProductVM = {
    id: 'prod-zero',
    sku: 'THERA-BAND-RED',
    name: 'Resistance Band Medium',
    description: 'Medium resistance elastic exercise band',
    category: InventoryCategory.CLINICAL_SUPPLIES,
    unitCost: { amount: 6.5, currency: 'USD' },
    sellingPrice: { amount: 15.0, currency: 'USD' },
    currentStock: 0,
    reorderThreshold: 15,
    unitOfMeasure: 'UNITS',
    status: InventoryItemStatus.ACTIVE,
    isLowStock: true,
    isOutOfStock: true,
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-09-01T10:00:00Z',
  };

  const mockProductLowStock: InventoryProductVM = {
    id: 'prod-low',
    sku: 'PROT-WHEY-1KG',
    name: 'Whey Protein Isolate 1kg',
    description: 'High purity chocolate protein powder',
    category: InventoryCategory.SUPPLEMENTS,
    unitCost: { amount: 28.0, currency: 'USD' },
    sellingPrice: { amount: 55.0, currency: 'USD' },
    currentStock: 4,
    reorderThreshold: 12,
    unitOfMeasure: 'TUBS',
    status: InventoryItemStatus.ACTIVE,
    isLowStock: true,
    isOutOfStock: false,
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-09-01T10:00:00Z',
  };

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    jest.clearAllMocks();

    (authProvider.useAuth as jest.Mock).mockReturnValue({
      hasPermission: (perm: string) => perm === 'inventory.write' || perm === 'inventory.read',
      currentUser: { id: 'admin-user', permissions: ['inventory.write', 'inventory.read'] },
      user: { id: 'admin-user', permissions: ['inventory.write', 'inventory.read'] },
    });

    (inventoryMutations.useReceiveStock as jest.Mock).mockReturnValue({
      mutate: mockReceiveMutate,
      isPending: false,
      error: null,
    });
  });

  const renderComponent = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <LowStockPage />
        </BrowserRouter>
      </QueryClientProvider>,
    );

  it('renders operational triage queue with zero-stock inclusion and threshold metrics', () => {
    (inventoryQueries.useLowStockItems as jest.Mock).mockReturnValue({
      data: [mockProductOutOfStock, mockProductLowStock],
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
    });

    renderComponent();

    // Verify Title & Subtitle
    expect(
      screen.getByRole('heading', { level: 1, name: /low stock attention queue/i }),
    ).toBeInTheDocument();

    // Verify KPI Summary Cards
    // Metric 1: Attention Required (2 items)
    expect(screen.getByTestId('metric-total-attention')).toHaveTextContent('2');
    // Metric 2: Critical Out of Stock (1 item with currentStock === 0)
    expect(screen.getByTestId('metric-out-of-stock')).toHaveTextContent('1');
    // Metric 3: Low Stock Warnings (1 item with 0 < currentStock <= reorderThreshold)
    expect(screen.getByTestId('metric-low-stock')).toHaveTextContent('1');
    // Metric 4: Total Deficit (+15 from band + 8 from whey = +23 units)
    expect(screen.getByTestId('metric-total-deficit')).toHaveTextContent('+23');

    // Verify Zero Stock item is rendered and explicitly flagged as OUT OF STOCK
    expect(screen.getByText('Resistance Band Medium')).toBeInTheDocument();
    expect(screen.getByText('THERA-BAND-RED')).toBeInTheDocument();
    expect(screen.getByText('OUT OF STOCK')).toBeInTheDocument();
    expect(screen.getByText('+15')).toBeInTheDocument();

    // Verify Low Stock item is rendered with LOW STOCK badge and deficit
    expect(screen.getByText('Whey Protein Isolate 1kg')).toBeInTheDocument();
    expect(screen.getByText('PROT-WHEY-1KG')).toBeInTheDocument();
    expect(screen.getByText('LOW STOCK')).toBeInTheDocument();
    expect(screen.getByText('+8')).toBeInTheDocument();
  });

  it('renders positive operational state when all inventory stocks are healthy', () => {
    (inventoryQueries.useLowStockItems as jest.Mock).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
    });

    renderComponent();

    expect(screen.getByTestId('low-stock-empty-healthy')).toBeInTheDocument();
    expect(screen.getByText('All Inventory Stocks Healthy')).toBeInTheDocument();
    expect(
      screen.getByText(/No products currently fall at or below configured reorder thresholds/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /browse full catalog/i })).toHaveAttribute(
      'href',
      '/resources/inventory',
    );
  });

  it('renders authorized action buttons for users with inventory.write permission', () => {
    (inventoryQueries.useLowStockItems as jest.Mock).mockReturnValue({
      data: [mockProductOutOfStock, mockProductLowStock],
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
    });

    renderComponent();

    const receiveButtons = screen.getAllByRole('button', { name: /receive stock/i });
    expect(receiveButtons).toHaveLength(2);
  });

  it('hides receive stock actions when user lacks inventory.write permission', () => {
    (authProvider.useAuth as jest.Mock).mockReturnValue({
      hasPermission: (perm: string) => perm === 'inventory.read',
      currentUser: { id: 'read-only-user', permissions: ['inventory.read'] },
      user: { id: 'read-only-user', permissions: ['inventory.read'] },
    });

    (inventoryQueries.useLowStockItems as jest.Mock).mockReturnValue({
      data: [mockProductOutOfStock, mockProductLowStock],
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
    });

    renderComponent();

    expect(screen.queryByRole('button', { name: /receive stock/i })).not.toBeInTheDocument();
    // Detail navigation links should still be accessible
    expect(screen.getAllByRole('link', { name: /details/i })).toHaveLength(2);
  });

  it('opens in-flow ReceiveStockDialog when Receive Stock button is clicked', async () => {
    (inventoryQueries.useLowStockItems as jest.Mock).mockReturnValue({
      data: [mockProductOutOfStock],
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
    });

    renderComponent();

    const receiveBtn = screen.getByTestId('receive-stock-btn-prod-zero');
    fireEvent.click(receiveBtn);

    // Verify modal appears with product name and context
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /receive inventory/i })).toBeInTheDocument();
      expect(screen.getAllByText(/Resistance Band Medium/i).length).toBeGreaterThanOrEqual(2);
    });
  });

  it('renders error state and triggers query refetch on retry', () => {
    (inventoryQueries.useLowStockItems as jest.Mock).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Failed to reach backend service'),
      refetch: mockRefetch,
    });

    renderComponent();

    expect(screen.getByTestId('low-stock-error')).toBeInTheDocument();
    expect(screen.getByText('Failed to reach backend service')).toBeInTheDocument();

    const retryBtn = screen.getByRole('button', { name: /retry query/i });
    fireEvent.click(retryBtn);

    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it('provides navigation links back to Catalog and Inventory Overview', () => {
    (inventoryQueries.useLowStockItems as jest.Mock).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
    });

    renderComponent();

    expect(screen.getByRole('link', { name: /back to catalog/i })).toHaveAttribute(
      'href',
      '/resources/inventory',
    );
    expect(screen.getByRole('link', { name: /inventory overview/i })).toHaveAttribute(
      'href',
      '/resources/inventory/overview',
    );
  });
});
