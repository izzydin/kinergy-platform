import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InventoryListPage } from '../routes/inventory-list-page';
import * as authProvider from '../../../../app/providers/auth-provider';
import * as inventoryQueries from '../hooks/use-inventory-queries';
import * as inventoryMutations from '../hooks/use-inventory-mutations';
import {
  InventoryCategory,
  InventoryItemStatus,
  type InventoryProductVM,
  type PaginatedInventoryVM,
} from '../types';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

jest.mock('../../../../app/providers/auth-provider', () => {
  const actual = jest.requireActual('../../../../app/providers/auth-provider');
  return {
    ...actual,
    useAuth: jest.fn(),
  };
});

jest.mock('../hooks/use-inventory-queries', () => ({
  useInventoryList: jest.fn(),
  useLowStockItems: jest.fn(),
  useInventoryValuation: jest.fn(),
}));

jest.mock('../hooks/use-inventory-mutations', () => ({
  useArchiveProduct: jest.fn(),
  useActivateProduct: jest.fn(),
  useCreateProduct: jest.fn(),
  useUpdateProduct: jest.fn(),
}));

describe('InventoryListPage & DataTable Integration', () => {
  let queryClient: QueryClient;

  const mockProductActive: InventoryProductVM = {
    id: 'prod-active-1',
    sku: 'PROT-VANILLA-2KG',
    name: 'Vanilla Whey 2kg',
    description: 'Protein powder',
    category: InventoryCategory.SUPPLEMENTS,
    unitCost: { amount: 30.0, currency: 'USD' },
    sellingPrice: { amount: 60.0, currency: 'USD' },
    currentStock: 15,
    reorderThreshold: 5,
    unitOfMeasure: 'TUBS',
    status: InventoryItemStatus.ACTIVE,
    isLowStock: false,
    isOutOfStock: false,
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-09-01T10:00:00Z',
  };

  const mockProductLowStock: InventoryProductVM = {
    id: 'prod-low-2',
    sku: 'TOWEL-MICROFIBER',
    name: 'Gym Towel Microfiber',
    description: 'Quick dry towel',
    category: InventoryCategory.RETAIL_PRODUCTS,
    unitCost: { amount: 4.0, currency: 'USD' },
    sellingPrice: { amount: 12.0, currency: 'USD' },
    currentStock: 2,
    reorderThreshold: 10,
    unitOfMeasure: 'UNITS',
    status: InventoryItemStatus.ACTIVE,
    isLowStock: true,
    isOutOfStock: false,
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-09-01T10:00:00Z',
  };

  const mockPaginatedData: PaginatedInventoryVM = {
    items: [mockProductActive, mockProductLowStock],
    total: 2,
    page: 1,
    limit: 10,
    totalPages: 1,
  };

  const mockArchiveMutate = jest.fn();
  const mockActivateMutate = jest.fn();

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    jest.clearAllMocks();

    (inventoryMutations.useArchiveProduct as jest.Mock).mockReturnValue({
      mutate: mockArchiveMutate,
      isPending: false,
    });
    (inventoryMutations.useActivateProduct as jest.Mock).mockReturnValue({
      mutate: mockActivateMutate,
      isPending: false,
    });
  });

  const renderComponent = (initialEntries = ['/resources/inventory']) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={initialEntries}>
          <InventoryListPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  };

  it('renders products, SKU, categories, prices, and stock indicators for authorized manager', () => {
    (authProvider.useAuth as jest.Mock).mockReturnValue({
      currentUser: {
        userId: 'mgr-1',
        email: 'mgr@kinergy.com',
        roles: ['OWNER'],
        permissions: ['inventory.read', 'inventory.write', 'valuation.read'],
      },
    });

    (inventoryQueries.useInventoryList as jest.Mock).mockReturnValue({
      data: mockPaginatedData,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    renderComponent();

    // 1. Header & Title verification
    expect(screen.getByText('Consumable Inventory')).toBeInTheDocument();
    expect(screen.getByText('Vanilla Whey 2kg')).toBeInTheDocument();
    expect(screen.getByText('Gym Towel Microfiber')).toBeInTheDocument();
    expect(screen.getByText('PROT-VANILLA-2KG')).toBeInTheDocument();
    expect(screen.getByText('TOWEL-MICROFIBER')).toBeInTheDocument();

    // 2. Sensitive Unit Cost column visible for valuation.read
    expect(screen.getByText('$30.00')).toBeInTheDocument();
    expect(screen.getByText('$4.00')).toBeInTheDocument();

    // 3. Retail Price column
    expect(screen.getByText('$60.00')).toBeInTheDocument();
    expect(screen.getByText('$12.00')).toBeInTheDocument();
  });

  it('hides Unit Cost column when user lacks valuation.read permission', () => {
    (authProvider.useAuth as jest.Mock).mockReturnValue({
      currentUser: {
        userId: 'trainer-1',
        email: 'trainer@kinergy.com',
        roles: ['TRAINER'],
        permissions: ['inventory.read'],
      },
    });

    (inventoryQueries.useInventoryList as jest.Mock).mockReturnValue({
      data: mockPaginatedData,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    renderComponent();

    // Unit Cost column should NOT be rendered
    expect(screen.queryByText('Unit Cost')).not.toBeInTheDocument();
    expect(screen.queryByText('$30.00')).not.toBeInTheDocument();

    // Retail price remains visible
    expect(screen.getByText('$60.00')).toBeInTheDocument();
  });

  it('renders loading skeleton while query is in progress', () => {
    (authProvider.useAuth as jest.Mock).mockReturnValue({
      currentUser: {
        userId: 'admin-1',
        email: 'admin@kinergy.com',
        roles: ['ADMIN'],
        permissions: ['inventory.read'],
      },
    });

    (inventoryQueries.useInventoryList as jest.Mock).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: jest.fn(),
    });

    renderComponent();

    expect(screen.getByLabelText('Loading table data')).toBeInTheDocument();
  });

  it('renders error state with retry button when query fails', () => {
    const mockRefetch = jest.fn();

    (authProvider.useAuth as jest.Mock).mockReturnValue({
      currentUser: {
        userId: 'admin-1',
        email: 'admin@kinergy.com',
        roles: ['ADMIN'],
        permissions: ['inventory.read'],
      },
    });

    (inventoryQueries.useInventoryList as jest.Mock).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Network error'),
      refetch: mockRefetch,
    });

    renderComponent();

    expect(screen.getByText('Failed to load data')).toBeInTheDocument();
    const retryBtn = screen.getByRole('button', { name: /try again|retry/i });
    fireEvent.click(retryBtn);
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('renders empty state when no products exist in catalog', () => {
    (authProvider.useAuth as jest.Mock).mockReturnValue({
      currentUser: {
        userId: 'admin-1',
        email: 'admin@kinergy.com',
        roles: ['ADMIN'],
        permissions: ['inventory.read', 'inventory.write'],
      },
    });

    (inventoryQueries.useInventoryList as jest.Mock).mockReturnValue({
      data: {
        items: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
      },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    renderComponent();

    expect(screen.getByText('No products in catalog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /register first product/i })).toBeInTheDocument();
  });

  it('parses canonical URL query parameters into filter parameters for useInventoryList', () => {
    (authProvider.useAuth as jest.Mock).mockReturnValue({
      currentUser: {
        userId: 'admin-1',
        email: 'admin@kinergy.com',
        roles: ['ADMIN'],
        permissions: ['inventory.read'],
      },
    });

    const mockUseInventoryList = inventoryQueries.useInventoryList as jest.Mock;
    mockUseInventoryList.mockReturnValue({
      data: mockPaginatedData,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    renderComponent([
      '/resources/inventory?search=whey&category=SUPPLEMENTS&stockStatus=LOW_STOCK&page=2&limit=20',
    ]);

    // Verifies useInventoryList was called with parsed query params from URL
    expect(mockUseInventoryList).toHaveBeenCalledWith(
      expect.objectContaining({
        search: 'whey',
        category: InventoryCategory.SUPPLEMENTS,
        stockStatus: 'LOW_STOCK',
        page: 2,
        limit: 20,
      }),
    );
  });

  it('restricts row action menu to View Details when user lacks write permission', () => {
    (authProvider.useAuth as jest.Mock).mockReturnValue({
      currentUser: {
        userId: 'trainer-1',
        email: 'trainer@kinergy.com',
        roles: ['TRAINER'],
        permissions: ['inventory.read'], // Read only
      },
    });

    (inventoryQueries.useInventoryList as jest.Mock).mockReturnValue({
      data: mockPaginatedData,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    renderComponent();

    // Open row action dropdown for first item
    const actionButtons = screen.getAllByRole('button', { name: /open actions menu/i });
    expect(actionButtons.length).toBeGreaterThan(0);
    fireEvent.click(actionButtons[0]!);

    // "View Details" should be visible
    expect(screen.getByText('View Details')).toBeInTheDocument();

    // Mutation actions must NOT be present
    expect(screen.queryByText('Edit Metadata')).not.toBeInTheDocument();
    expect(screen.queryByText('Receive Stock (+)')).not.toBeInTheDocument();
    expect(screen.queryByText('Record Sale (-)')).not.toBeInTheDocument();
    expect(screen.queryByText('Scrap Damaged Stock')).not.toBeInTheDocument();
  });

  it('renders full suite of operational mutation actions when user possesses inventory.write', () => {
    (authProvider.useAuth as jest.Mock).mockReturnValue({
      currentUser: {
        userId: 'manager-1',
        email: 'manager@kinergy.com',
        roles: ['ADMIN'],
        permissions: ['inventory.read', 'inventory.write'],
      },
    });

    (inventoryQueries.useInventoryList as jest.Mock).mockReturnValue({
      data: mockPaginatedData,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    renderComponent();

    // Open row action dropdown for first item
    const actionButtons = screen.getAllByRole('button', { name: /open actions menu/i });
    fireEvent.click(actionButtons[0]!);

    // Mutation actions must be present
    expect(screen.getByText('View Details')).toBeInTheDocument();
    expect(screen.getByText('Edit Metadata')).toBeInTheDocument();
    expect(screen.getByText('Receive Stock (+)')).toBeInTheDocument();
    expect(screen.getByText('Record Sale (-)')).toBeInTheDocument();
    expect(screen.getByText('Clinical Consumption (-)')).toBeInTheDocument();
    expect(screen.getByText('Physical Adjustment (±)')).toBeInTheDocument();
    expect(screen.getByText('Scrap Damaged Stock')).toBeInTheDocument();
    expect(screen.getByText('Archive Product')).toBeInTheDocument();
  });
});
