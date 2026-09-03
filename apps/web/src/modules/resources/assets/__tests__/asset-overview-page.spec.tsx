import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AssetOverviewPage } from '../routes/asset-overview-page';
import * as authProvider from '../../../../app/providers/auth-provider';
import * as assetQueries from '../hooks/use-assets-queries';
import {
  AssetCategory,
  AssetStatus,
  AssetCondition,
  type FixedAssetVM,
  type FixedAssetValuationSummaryVM,
} from '../types';

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

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('AssetOverviewPage & Operational Components', () => {
  let queryClient: QueryClient;

  const mockMaintenanceAsset: FixedAssetVM = {
    id: 'ast-maint-1',
    assetTag: 'AST-GYM-001',
    name: 'Treadmill Commercial T80',
    description: 'High performance treadmill with running belt issue',
    category: AssetCategory.GYM_EQUIPMENT,
    status: AssetStatus.UNDER_MAINTENANCE,
    condition: AssetCondition.FAIR,
    purchaseDate: '2025-01-10T00:00:00Z',
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
    id: 'ast-dmg-1',
    assetTag: 'AST-REHAB-002',
    name: 'Biodex Multi-Joint System',
    description: 'Dynamometer power supply malfunction',
    category: AssetCategory.THERAPY_EQUIPMENT,
    status: AssetStatus.DAMAGED,
    condition: AssetCondition.OUT_OF_SERVICE,
    purchaseDate: '2024-06-15T00:00:00Z',
    location: {
      facilityId: 'fac-main',
      roomId: 'room-physio-2',
    },
    version: 2,
    createdAt: '2024-06-15T00:00:00Z',
    updatedAt: '2026-09-02T00:00:00Z',
  };

  const mockValuation: FixedAssetValuationSummaryVM = {
    totalCarryingValueAmount: 145000.5,
    totalPurchaseValueAmount: 180000.0,
    currency: 'USD',
    totalAssetCount: 25,
    activeAssetCount: 22,
    calculatedAt: '2026-09-03T10:00:00Z',
  };

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    jest.clearAllMocks();
  });

  const setupMocks = ({
    userPermissions = ['assets.read', 'billing.read', 'assets.write'],
    activeTotal = 22,
    totalCount = 25,
    maintenanceItems = [mockMaintenanceAsset],
    damagedItems = [mockDamagedAsset],
    isLoading = false,
    isError = false,
    isValuationLoading = false,
    isValuationError = false,
  } = {}) => {
    (authProvider.useAuth as jest.Mock).mockReturnValue({
      currentUser: {
        id: 'usr-1',
        email: 'manager@kinergy.io',
        name: 'Operations Manager',
        roles: ['OPERATOR'],
        permissions: userPermissions,
        tenantId: 'tenant-1',
      },
      hasPermission: (p: string) => userPermissions.includes(p),
      hasRole: () => true,
      isAuthenticated: true,
    });

    (assetQueries.useAssetsList as jest.Mock).mockImplementation((params) => {
      if (isLoading) {
        return { data: undefined, isLoading: true, isError: false, refetch: jest.fn() };
      }
      if (isError) {
        return { data: undefined, isLoading: false, isError: true, refetch: jest.fn() };
      }

      if (params?.status === AssetStatus.ACTIVE) {
        return {
          data: { total: activeTotal, items: [] },
          isLoading: false,
          isError: false,
          refetch: jest.fn(),
        };
      }
      if (params?.status === AssetStatus.UNDER_MAINTENANCE) {
        return {
          data: { total: maintenanceItems.length, items: maintenanceItems },
          isLoading: false,
          isError: false,
          refetch: jest.fn(),
        };
      }
      if (params?.status === AssetStatus.DAMAGED) {
        return {
          data: { total: damagedItems.length, items: damagedItems },
          isLoading: false,
          isError: false,
          refetch: jest.fn(),
        };
      }
      if (params?.includeDecommissioned) {
        return {
          data: { total: totalCount, items: [] },
          isLoading: false,
          isError: false,
          refetch: jest.fn(),
        };
      }
      return {
        data: { total: 0, items: [] },
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      };
    });

    (assetQueries.useAssetValuationSummary as jest.Mock).mockImplementation((_params, options) => {
      if (!options?.enabled) {
        return { data: undefined, isLoading: false, isError: false, refetch: jest.fn() };
      }
      if (isValuationLoading) {
        return { data: undefined, isLoading: true, isError: false, refetch: jest.fn() };
      }
      if (isValuationError) {
        return { data: undefined, isLoading: false, isError: true, refetch: jest.fn() };
      }
      return {
        data: mockValuation,
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      };
    });
  };

  const renderComponent = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AssetOverviewPage />
        </BrowserRouter>
      </QueryClientProvider>,
    );
  };

  describe('1. Operational Lifecycle Summary Rendering', () => {
    it('renders active in-service count and total fleet count', () => {
      setupMocks();
      renderComponent();

      expect(screen.getByText('Active In-Service')).toBeInTheDocument();
      expect(screen.getByText('22')).toBeInTheDocument();
      expect(screen.getByText(/of 25 total assets/i)).toBeInTheDocument();
    });

    it('renders attention metrics with maintenance and damaged badges', () => {
      setupMocks();
      renderComponent();

      expect(screen.getByText('Needs Attention')).toBeInTheDocument();
      // Attention count is 2 (1 maintenance + 1 damaged)
      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getByText('1 In Service')).toBeInTheDocument();
      expect(screen.getByText('1 Damaged')).toBeInTheDocument();
    });
  });

  describe('2. Valuation Security Boundaries', () => {
    it('displays carrying value and CAPEX purchase value for authorized financial operators (billing.read)', () => {
      setupMocks({ userPermissions: ['assets.read', 'billing.read', 'assets.write'] });
      renderComponent();

      const valuationCard = screen.getByTestId('valuation-authorized');
      expect(valuationCard).toBeInTheDocument();
      expect(screen.getByText('$145,000.50')).toBeInTheDocument();
      expect(screen.getByText(/CAPEX Cost: \$180,000.00/i)).toBeInTheDocument();
      expect(screen.queryByTestId('valuation-restricted')).not.toBeInTheDocument();
    });

    it('displays financial restricted state without firing query for unauthorized users (missing billing.read)', () => {
      setupMocks({ userPermissions: ['assets.read'] });
      renderComponent();

      expect(screen.getByTestId('valuation-restricted')).toBeInTheDocument();
      expect(screen.getByText('Financial Access Restricted')).toBeInTheDocument();
      expect(screen.getByText('billing.read')).toBeInTheDocument();
      expect(screen.getByText(/executive authorization/i)).toBeInTheDocument();
      expect(screen.queryByTestId('valuation-authorized')).not.toBeInTheDocument();
      expect(screen.queryByText('$145,000.50')).not.toBeInTheDocument();
    });
  });

  describe('3. Attention Queue Table States', () => {
    it('renders table with damaged equipment prioritized above routine servicing', () => {
      setupMocks();
      renderComponent();

      expect(screen.getByTestId('asset-attention-queue')).toBeInTheDocument();
      expect(screen.getByTestId('attention-queue-table')).toBeInTheDocument();

      // Damaged item
      expect(screen.getByText('Biodex Multi-Joint System')).toBeInTheDocument();
      expect(screen.getByText('AST-REHAB-002')).toBeInTheDocument();
      expect(screen.getByText(/Out of Service/i)).toBeInTheDocument();

      // Maintenance item
      expect(screen.getByText('Treadmill Commercial T80')).toBeInTheDocument();
      expect(screen.getByText('AST-GYM-001')).toBeInTheDocument();
      expect(screen.getAllByText(/Under Maintenance/i)[0]).toBeInTheDocument();
    });

    it('renders empty state when zero assets require attention', () => {
      setupMocks({ maintenanceItems: [], damagedItems: [] });
      renderComponent();

      expect(screen.getByTestId('attention-queue-empty')).toBeInTheDocument();
      expect(screen.getByText('All Equipment Operational')).toBeInTheDocument();
      expect(
        screen.getByText(/No physical assets are currently damaged or offline for servicing/i),
      ).toBeInTheDocument();
      expect(screen.queryByTestId('attention-queue-table')).not.toBeInTheDocument();
    });

    it('renders loading skeletons when queries are pending', () => {
      setupMocks({ isLoading: true });
      renderComponent();

      expect(screen.getByTestId('attention-queue-loading')).toBeInTheDocument();
    });

    it('renders error state with retry button when query fails', () => {
      setupMocks({ isError: true });
      renderComponent();

      expect(screen.getByTestId('attention-queue-error')).toBeInTheDocument();
      expect(screen.getByText('Failed to load attention queue')).toBeInTheDocument();
      expect(screen.getByText('Try Again')).toBeInTheDocument();
    });
  });

  describe('4. Navigation & Action Workflows', () => {
    it('navigates to commissioning route when Commission Asset button is clicked', () => {
      setupMocks({ userPermissions: ['assets.read', 'assets.write'] });
      renderComponent();

      const commissionButtons = screen.getAllByText('Commission Asset');
      expect(commissionButtons[0]).toBeDefined();
      fireEvent.click(commissionButtons[0]!);
      expect(mockNavigate).toHaveBeenCalledWith('/resources/assets/new');
    });

    it('navigates to maintenance logging when Log Service is clicked on attention item', () => {
      setupMocks({ userPermissions: ['assets.read', 'assets.write'] });
      renderComponent();

      const logServiceButtons = screen.getAllByText('Log Service');
      expect(logServiceButtons[0]).toBeDefined();
      fireEvent.click(logServiceButtons[0]!);
      expect(mockNavigate).toHaveBeenCalledWith('/resources/assets/ast-dmg-1/maintenance');
    });

    it('hides write actions for read-only operators', () => {
      setupMocks({ userPermissions: ['assets.read'] });
      renderComponent();

      expect(screen.queryByText('Log Service')).not.toBeInTheDocument();
    });
  });
});
