import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InventoryOverviewPage } from '../routes/inventory-overview-page';
import * as authProvider from '../../../../app/providers/auth-provider';
import * as inventoryQueries from '../hooks/use-inventory-queries';
import {
  InventoryCategory,
  InventoryItemStatus,
  type InventoryProductVM,
  type InventoryValuationVM,
} from '../types';

jest.mock('../../../../app/providers/auth-provider', () => {
  const actual = jest.requireActual('../../../../app/providers/auth-provider');
  return {
    ...actual,
    useAuth: jest.fn(),
  };
});

jest.mock('../hooks/use-inventory-queries', () => ({
  useLowStockItems: jest.fn(),
  useInventoryValuation: jest.fn(),
}));

describe('InventoryOverviewPage & Components', () => {
  let queryClient: QueryClient;

  const mockProductLowStock: InventoryProductVM = {
    id: 'prod-1',
    sku: 'PROT-WHEY-1KG',
    name: 'Whey Protein Isolate',
    description: 'Protein powder',
    category: InventoryCategory.SUPPLEMENTS,
    unitCost: { amount: 25.0, currency: 'USD' },
    sellingPrice: { amount: 45.0, currency: 'USD' },
    currentStock: 3,
    reorderThreshold: 10,
    unitOfMeasure: 'UNITS',
    status: InventoryItemStatus.ACTIVE,
    isLowStock: true,
    isOutOfStock: false,
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-09-01T10:00:00Z',
  };

  const mockProductOutOfStock: InventoryProductVM = {
    id: 'prod-2',
    sku: 'CLEAN-SPRAY-500',
    name: 'Disinfectant Spray',
    description: 'Surface spray',
    category: InventoryCategory.CLEANING_SUPPLIES,
    unitCost: { amount: 8.0, currency: 'USD' },
    sellingPrice: { amount: 15.0, currency: 'USD' },
    currentStock: 0,
    reorderThreshold: 5,
    unitOfMeasure: 'BOTTLES',
    status: InventoryItemStatus.ACTIVE,
    isLowStock: true,
    isOutOfStock: true,
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-09-01T10:00:00Z',
  };

  const mockValuation: InventoryValuationVM = {
    totalDistinctItems: 42,
    totalQuantityUnits: 1250,
    totalValueAmount: 18450.75,
    currency: 'USD',
    calculatedAt: '2026-09-02T10:00:00Z',
  };

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    jest.clearAllMocks();
  });

  const renderComponent = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <InventoryOverviewPage />
        </BrowserRouter>
      </QueryClientProvider>,
    );
  };

  it('renders operational inventory overview with low stock items for authorized staff', () => {
    (authProvider.useAuth as jest.Mock).mockReturnValue({
      currentUser: {
        userId: 'user-1',
        email: 'manager@kinergy.com',
        roles: ['OWNER'],
        permissions: ['inventory.read', 'inventory.write', 'valuation.read'],
      },
    });

    (inventoryQueries.useLowStockItems as jest.Mock).mockReturnValue({
      data: [mockProductLowStock, mockProductOutOfStock],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    (inventoryQueries.useInventoryValuation as jest.Mock).mockReturnValue({
      data: mockValuation,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    renderComponent();

    // 1. Header Verification
    expect(screen.getByText('Inventory Overview')).toBeInTheDocument();
    expect(screen.getByText('Register Product')).toBeInTheDocument();

    // 2. Summary KPI Verification
    expect(screen.getByText('2')).toBeInTheDocument(); // 2 low stock items
    expect(screen.getByText('1 Out of Stock')).toBeInTheDocument();
    expect(screen.getByText('$18,450.75')).toBeInTheDocument(); // Formatted valuation

    // 3. Low Stock Table Verification
    expect(screen.getByText('Whey Protein Isolate')).toBeInTheDocument();
    expect(screen.getByText('Disinfectant Spray')).toBeInTheDocument();
    expect(screen.getByText('PROT-WHEY-1KG')).toBeInTheDocument();
    expect(screen.getByText('CLEAN-SPRAY-500')).toBeInTheDocument();
  });

  it('masks financial valuation metrics when user lacks valuation.read permission', () => {
    (authProvider.useAuth as jest.Mock).mockReturnValue({
      currentUser: {
        userId: 'user-2',
        email: 'trainer@kinergy.com',
        roles: ['TRAINER'],
        permissions: ['inventory.read'],
      },
    });

    (inventoryQueries.useLowStockItems as jest.Mock).mockReturnValue({
      data: [mockProductLowStock],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    (inventoryQueries.useInventoryValuation as jest.Mock).mockReturnValue({
      data: mockValuation,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    renderComponent();

    // Financial metric is hidden/restricted
    expect(screen.getByText('Financial Access Restricted')).toBeInTheDocument();
    expect(screen.queryByText('$18,450.75')).not.toBeInTheDocument();
  });

  it('renders healthy stock banner when no products are low on stock', () => {
    (authProvider.useAuth as jest.Mock).mockReturnValue({
      currentUser: {
        userId: 'user-1',
        email: 'admin@kinergy.com',
        roles: ['ADMIN'],
        permissions: ['inventory.read', 'valuation.read'],
      },
    });

    (inventoryQueries.useLowStockItems as jest.Mock).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    (inventoryQueries.useInventoryValuation as jest.Mock).mockReturnValue({
      data: mockValuation,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    renderComponent();

    expect(screen.getByText('All stock levels healthy')).toBeInTheDocument();
    expect(screen.getByText('All Inventory Stocks Healthy')).toBeInTheDocument();
  });

  it('handles query error states with retry callback', () => {
    const refetchLowStock = jest.fn();

    (authProvider.useAuth as jest.Mock).mockReturnValue({
      currentUser: {
        userId: 'user-1',
        email: 'admin@kinergy.com',
        roles: ['ADMIN'],
        permissions: ['inventory.read', 'valuation.read'],
      },
    });

    (inventoryQueries.useLowStockItems as jest.Mock).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: refetchLowStock,
    });

    (inventoryQueries.useInventoryValuation as jest.Mock).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: jest.fn(),
    });

    renderComponent();

    expect(screen.getByText('Failed to load stock health')).toBeInTheDocument();
    expect(screen.getByText('Failed to load low-stock items')).toBeInTheDocument();

    const retryButtons = screen.getAllByRole('button', { name: /retry|try again/i });
    expect(retryButtons.length).toBeGreaterThan(0);
    const firstRetryBtn = retryButtons[0];
    if (firstRetryBtn) {
      fireEvent.click(firstRetryBtn);
      expect(refetchLowStock).toHaveBeenCalled();
    }
  });
});
