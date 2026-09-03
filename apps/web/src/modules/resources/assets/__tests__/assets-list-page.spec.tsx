import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AssetsListPage } from '../routes/assets-list-page';
import * as authProvider from '../../../../app/providers/auth-provider';
import * as assetQueries from '../hooks/use-assets-queries';
import {
  AssetCategory,
  AssetStatus,
  AssetCondition,
  type FixedAssetVM,
  type PaginatedFixedAssetsVM,
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

jest.mock('../hooks/use-assets-queries', () => ({
  useAssetsList: jest.fn(),
  useAssetValuationSummary: jest.fn(),
}));

describe('AssetsListPage & DataTable URL Integration', () => {
  let queryClient: QueryClient;

  const mockActiveAsset: FixedAssetVM = {
    id: 'ast-active-1',
    assetTag: 'AST-GYM-001',
    name: 'Treadmill Commercial T80',
    description: 'High performance cardio treadmill',
    category: AssetCategory.GYM_EQUIPMENT,
    status: AssetStatus.ACTIVE,
    condition: AssetCondition.EXCELLENT,
    purchaseDate: '2025-01-10T00:00:00Z',
    purchaseValueAmount: 4500.0,
    purchaseValueCurrency: 'USD',
    currentEstimatedValueAmount: 4200.0,
    currentEstimatedValueCurrency: 'USD',
    location: {
      facilityId: 'fac-main',
      roomId: 'room-cardio-1',
      zone: 'Zone A',
    },
    version: 1,
    createdAt: '2025-01-10T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
  };

  const mockDamagedAsset: FixedAssetVM = {
    id: 'ast-dmg-2',
    assetTag: 'AST-REHAB-002',
    name: 'Biodex Multi-Joint System',
    description: 'Dynamometer power supply issue',
    category: AssetCategory.THERAPY_EQUIPMENT,
    status: AssetStatus.DAMAGED,
    condition: AssetCondition.OUT_OF_SERVICE,
    purchaseDate: '2024-06-15T00:00:00Z',
    purchaseValueAmount: 12000.0,
    purchaseValueCurrency: 'USD',
    currentEstimatedValueAmount: 8500.0,
    currentEstimatedValueCurrency: 'USD',
    location: {
      facilityId: 'fac-main',
      roomId: 'room-physio-2',
    },
    version: 2,
    createdAt: '2024-06-15T00:00:00Z',
    updatedAt: '2026-09-02T00:00:00Z',
  };

  const mockSoldAsset: FixedAssetVM = {
    id: 'ast-sold-3',
    assetTag: 'AST-LEGACY-003',
    name: 'Old Spin Bike V1',
    description: 'Decommissioned and sold to third party',
    category: AssetCategory.GYM_EQUIPMENT,
    status: AssetStatus.SOLD,
    condition: AssetCondition.FAIR,
    purchaseDate: '2022-03-01T00:00:00Z',
    purchaseValueAmount: 1500.0,
    purchaseValueCurrency: 'USD',
    location: {
      facilityId: 'fac-warehouse',
    },
    version: 4,
    createdAt: '2022-03-01T00:00:00Z',
    updatedAt: '2026-08-15T00:00:00Z',
  };

  const mockPaginatedData: PaginatedFixedAssetsVM = {
    items: [mockActiveAsset, mockDamagedAsset],
    total: 2,
    page: 1,
    limit: 10,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  };

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    jest.clearAllMocks();
  });

  const renderComponent = (initialEntries = ['/resources/assets']) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={initialEntries}>
          <AssetsListPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  };

  describe('1. Data Presentation and Column Rendering', () => {
    it('renders equipment name, tags, category, location, and status badges', () => {
      (authProvider.useAuth as jest.Mock).mockReturnValue({
        currentUser: {
          id: 'usr-1',
          name: 'Asset Manager',
          roles: ['OPERATOR'],
          permissions: ['assets.read', 'assets.write', 'billing.read'],
        },
        hasPermission: () => true,
        hasRole: () => true,
      });

      (assetQueries.useAssetsList as jest.Mock).mockReturnValue({
        data: mockPaginatedData,
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });

      renderComponent();

      // Header title & Track C badge
      expect(screen.getByText('Fixed Assets')).toBeInTheDocument();
      expect(screen.getByText('Track C DataTable')).toBeInTheDocument();

      // Asset items
      expect(screen.getByText('Treadmill Commercial T80')).toBeInTheDocument();
      expect(screen.getByText('AST-GYM-001')).toBeInTheDocument();
      expect(screen.getByText('Biodex Multi-Joint System')).toBeInTheDocument();
      expect(screen.getByText('AST-REHAB-002')).toBeInTheDocument();

      // Badges
      expect(screen.getByText('Gym Equipment')).toBeInTheDocument();
      expect(screen.getByText('Active')).toBeInTheDocument();
      expect(screen.getByText(/Rank 1 • Excellent/i)).toBeInTheDocument();
      expect(screen.getByText('Damaged')).toBeInTheDocument();
      expect(screen.getByText(/Rank 5 • Out of Service/i)).toBeInTheDocument();
    });

    it('displays sensitive valuation column when user has billing.read permission', () => {
      (authProvider.useAuth as jest.Mock).mockReturnValue({
        currentUser: {
          id: 'usr-fin',
          roles: ['ADMIN'],
          permissions: ['assets.read', 'billing.read'],
        },
        hasPermission: () => true,
        hasRole: () => true,
      });

      (assetQueries.useAssetsList as jest.Mock).mockReturnValue({
        data: mockPaginatedData,
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });

      renderComponent();

      expect(screen.getByText('Valuation')).toBeInTheDocument();
      expect(screen.getByText('$4200.00 USD')).toBeInTheDocument();
      expect(screen.getByText(/Cost: \$4500.00/i)).toBeInTheDocument();
    });

    it('hides sensitive valuation column when user lacks billing.read permission', () => {
      (authProvider.useAuth as jest.Mock).mockReturnValue({
        currentUser: {
          id: 'usr-readonly',
          roles: ['OPERATOR'],
          permissions: ['assets.read'],
        },
        hasPermission: (p: string) => p === 'assets.read',
        hasRole: () => false,
      });

      (assetQueries.useAssetsList as jest.Mock).mockReturnValue({
        data: mockPaginatedData,
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });

      renderComponent();

      expect(screen.queryByText('Valuation')).not.toBeInTheDocument();
      expect(screen.queryByText('$4200.00 USD')).not.toBeInTheDocument();
    });
  });

  describe('2. Canonical URL State Parsing & Determinism', () => {
    it('parses URL query parameters into filter params for useAssetsList', () => {
      (authProvider.useAuth as jest.Mock).mockReturnValue({
        currentUser: {
          id: 'usr-1',
          permissions: ['assets.read'],
        },
        hasPermission: () => true,
        hasRole: () => true,
      });

      const mockUseAssetsList = assetQueries.useAssetsList as jest.Mock;
      mockUseAssetsList.mockReturnValue({
        data: mockPaginatedData,
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });

      renderComponent([
        '/resources/assets?search=Treadmill&category=GYM_EQUIPMENT&status=DAMAGED&condition=OUT_OF_SERVICE&page=2&limit=20&sort=name.desc&includeDecommissioned=true',
      ]);

      // URL -> Parsed Canonical State -> API Query Input -> Query Key
      expect(mockUseAssetsList).toHaveBeenCalledWith(
        expect.objectContaining({
          search: 'Treadmill',
          category: AssetCategory.GYM_EQUIPMENT,
          status: AssetStatus.DAMAGED,
          condition: AssetCondition.OUT_OF_SERVICE,
          page: 2,
          limit: 20,
          sortBy: 'name',
          sortOrder: 'desc',
          includeDecommissioned: true,
        }),
      );
    });
  });

  describe('3. Terminal Lifecycle States (SOLD and RETIRED)', () => {
    it('renders decommissioned visual cue and status indicator for terminal assets', () => {
      (authProvider.useAuth as jest.Mock).mockReturnValue({
        currentUser: {
          id: 'usr-mgr',
          permissions: ['assets.read', 'assets.write'],
        },
        hasPermission: () => true,
        hasRole: () => true,
      });

      (assetQueries.useAssetsList as jest.Mock).mockReturnValue({
        data: {
          items: [mockSoldAsset],
          total: 1,
          page: 1,
          limit: 10,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });

      renderComponent(['/resources/assets?includeDecommissioned=true']);

      expect(screen.getByText('Old Spin Bike V1')).toBeInTheDocument();
      expect(screen.getByText('AST-LEGACY-003')).toBeInTheDocument();
      expect(screen.getAllByText('SOLD')[0]).toBeInTheDocument();
    });
  });

  describe('4. Loading, Empty, and Error States', () => {
    it('renders loading skeleton when query is pending', () => {
      (authProvider.useAuth as jest.Mock).mockReturnValue({
        currentUser: { permissions: ['assets.read'] },
        hasPermission: () => true,
        hasRole: () => true,
      });

      (assetQueries.useAssetsList as jest.Mock).mockReturnValue({
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
        currentUser: { permissions: ['assets.read'] },
        hasPermission: () => true,
        hasRole: () => true,
      });

      (assetQueries.useAssetsList as jest.Mock).mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new Error('Network connection error'),
        refetch: mockRefetch,
      });

      renderComponent();

      expect(screen.getByText('Failed to load data')).toBeInTheDocument();
      const retryBtn = screen.getByRole('button', { name: /try again|retry/i });
      fireEvent.click(retryBtn);
      expect(mockRefetch).toHaveBeenCalled();
    });

    it('renders empty estate state when no assets have been registered', () => {
      (authProvider.useAuth as jest.Mock).mockReturnValue({
        currentUser: { permissions: ['assets.read', 'assets.write'] },
        hasPermission: () => true,
        hasRole: () => true,
      });

      (assetQueries.useAssetsList as jest.Mock).mockReturnValue({
        data: {
          items: [],
          total: 0,
          page: 1,
          limit: 10,
          totalPages: 0,
          hasNextPage: false,
          hasPreviousPage: false,
        },
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });

      renderComponent();

      expect(screen.getByText('No fixed assets registered')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /commission first asset/i })).toBeInTheDocument();
    });
  });

  describe('5. Navigation and Fast-Path Routing', () => {
    it('navigates to commissioning route when Commission Asset is clicked', () => {
      (authProvider.useAuth as jest.Mock).mockReturnValue({
        currentUser: { permissions: ['assets.read', 'assets.write'] },
        hasPermission: () => true,
        hasRole: () => true,
      });

      (assetQueries.useAssetsList as jest.Mock).mockReturnValue({
        data: mockPaginatedData,
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });

      renderComponent();

      const commissionButtons = screen.getAllByText('Commission New Asset');
      expect(commissionButtons[0]).toBeDefined();
      fireEvent.click(commissionButtons[0]!);
      expect(mockNavigate).toHaveBeenCalledWith('/resources/assets/new');
    });
  });
});
