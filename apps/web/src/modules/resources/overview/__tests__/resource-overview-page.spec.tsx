import '@testing-library/jest-dom';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ResourceOverviewPage } from '../routes/resource-overview-page';
import * as authModule from '../../../../app/providers/auth-provider';
import * as overviewHooks from '../hooks/use-resource-overview';
import type { ResourceOverviewVM } from '../types';

jest.mock('../../../../app/providers/auth-provider', () => {
  const actual = jest.requireActual('../../../../app/providers/auth-provider');
  return {
    ...actual,
    useAuth: jest.fn(),
  };
});

jest.mock('../hooks/use-resource-overview', () => ({
  useResourceOverview: jest.fn(),
}));

describe('ResourceOverviewPage & Architecture (Milestone 6.14)', () => {
  let queryClient: QueryClient;

  const mockPopulatedOverview: ResourceOverviewVM = {
    consumableInventory: {
      totalValueAmount: 48500.75,
      lowStockItemCount: 3,
      totalDistinctItems: 24,
      totalQuantityUnits: 1540,
    },
    fixedAssets: {
      totalCarryingValueAmount: 142000.0,
      activeAssetCount: 12,
      underMaintenanceAssetCount: 2,
      damagedAssetCount: 1,
      retiredAssetCount: 3,
      totalAssetCount: 18,
    },
    combined: {
      totalCombinedValueAmount: 190500.75,
    },
    currency: 'USD',
    calculatedAt: '2026-09-06T14:30:00.000Z',
  };

  const mockEmptyOverview: ResourceOverviewVM = {
    consumableInventory: {
      totalValueAmount: 0,
      lowStockItemCount: 0,
      totalDistinctItems: 0,
      totalQuantityUnits: 0,
    },
    fixedAssets: {
      totalCarryingValueAmount: 0,
      activeAssetCount: 0,
      underMaintenanceAssetCount: 0,
      damagedAssetCount: 0,
      retiredAssetCount: 0,
      totalAssetCount: 0,
    },
    combined: {
      totalCombinedValueAmount: 0,
    },
    currency: 'USD',
    calculatedAt: '2026-09-06T14:30:00.000Z',
  };

  const mockAdminUser = {
    id: 'user-admin',
    name: 'Executive Admin',
    email: 'admin@kinergy.io',
    roles: ['ADMIN'],
    permissions: ['inventory.read', 'assets.read', 'billing.read'],
  };

  const mockStandardResourceUser = {
    id: 'user-operator',
    name: 'Resource Controller',
    email: 'controller@kinergy.io',
    roles: ['OPERATOR'],
    permissions: ['inventory.read', 'assets.read', 'billing.read'],
  };

  const mockUnauthorizedUser = {
    id: 'user-member',
    name: 'Standard Member',
    email: 'member@kinergy.io',
    roles: ['MEMBER'],
    permissions: ['inventory.read'], // Missing assets.read and billing.read
  };

  const setupAuth = (user = mockAdminUser) => {
    (authModule.useAuth as jest.Mock).mockReturnValue({
      currentUser: user,
      isAuthenticated: true,
      hasRole: (role: string) => user.roles.includes(role),
      hasPermission: (perm: string) => user.permissions.includes(perm),
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    setupAuth(mockAdminUser);
  });

  const renderComponent = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <ResourceOverviewPage />
        </BrowserRouter>
      </QueryClientProvider>,
    );

  describe('1. Semantic Distinction and Conceptual Areas', () => {
    beforeEach(() => {
      (overviewHooks.useResourceOverview as jest.Mock).mockReturnValue({
        data: mockPopulatedOverview,
        isLoading: false,
        isError: false,
        error: null,
        refetch: jest.fn(),
        isFetching: false,
      });
    });

    it('renders the 3 distinct conceptual areas', () => {
      renderComponent();

      // Page Title
      expect(
        screen.getByRole('heading', { level: 1, name: /Resource Overview/i }),
      ).toBeInTheDocument();

      // Area 1: Executive Balance Sheet Summary / Overall Resource Value
      expect(
        screen.getByRole('heading', { level: 2, name: /Executive Balance Sheet Summary/i }),
      ).toBeInTheDocument();

      // Area 2: Domain A — Consumable Inventory
      expect(
        screen.getByRole('heading', { level: 2, name: /Consumable Inventory/i }),
      ).toBeInTheDocument();

      // Area 3: Domain B — Fixed Assets
      expect(screen.getByRole('heading', { level: 2, name: /Fixed Assets/i })).toBeInTheDocument();
    });

    it('prominently labels "Combined Resource Value" and never labels it as "Inventory"', () => {
      renderComponent();

      // Combined Resource Value heading exists
      expect(screen.getByText('Combined Resource Value')).toBeInTheDocument();

      // Combined card renders the combined value
      const overallCard = screen.getByTestId('overall-resource-value-card');
      expect(within(overallCard).getByText('$190,500.75')).toBeInTheDocument();

      // Combined value is explicitly separated into both domains
      const inventoryBreakdown = screen.getByTestId('combined-breakdown-inventory');
      expect(within(inventoryBreakdown).getByText('$48,500.75')).toBeInTheDocument();

      const assetsBreakdown = screen.getByTestId('combined-breakdown-assets');
      expect(within(assetsBreakdown).getByText('$142,000.00')).toBeInTheDocument();
    });

    it('displays Domain A (Consumable Inventory) concept statement and required metrics', () => {
      renderComponent();

      // Concept Statement: "What we have available for sale or consumption"
      expect(
        screen.getByText(/“What we have available for sale or consumption”/i),
      ).toBeInTheDocument();

      // Metric 1: Consumable Inventory Value
      const inventorySection = screen.getByTestId('consumable-inventory-section');
      expect(within(inventorySection).getByText('Consumable Inventory Value')).toBeInTheDocument();
      expect(within(inventorySection).getByText('$48,500.75')).toBeInTheDocument();

      // Metric 2: Low Stock Items
      expect(within(inventorySection).getByText('Low Stock Items')).toBeInTheDocument();
      expect(within(inventorySection).getByText('3')).toBeInTheDocument();
      expect(within(inventorySection).getByText('Reorder Required')).toBeInTheDocument();

      // Additional operational counts
      expect(within(inventorySection).getByText('Distinct Products')).toBeInTheDocument();
      expect(within(inventorySection).getByText('24')).toBeInTheDocument();
      expect(within(inventorySection).getByText('Total Physical Units')).toBeInTheDocument();
      expect(within(inventorySection).getByText('1,540')).toBeInTheDocument();
    });

    it('displays Domain B (Fixed Assets) concept statement and required metrics', () => {
      renderComponent();

      // Concept Statement: "What the business owns as fixed assets"
      expect(screen.getByText(/“What the business owns as fixed assets”/i)).toBeInTheDocument();

      const assetsSection = screen.getByTestId('fixed-assets-section');

      // Metric 1: Fixed Asset Value
      expect(within(assetsSection).getByText('Fixed Asset Value')).toBeInTheDocument();
      expect(within(assetsSection).getByText('$142,000.00')).toBeInTheDocument();

      // Metric 2: Active Assets
      expect(within(assetsSection).getByText('Active Assets')).toBeInTheDocument();
      expect(within(assetsSection).getByText('12')).toBeInTheDocument();

      // Metric 3: Under Maintenance
      expect(within(assetsSection).getByText('Under Maintenance')).toBeInTheDocument();
      expect(within(assetsSection).getByText('2')).toBeInTheDocument();

      // Metric 4: Damaged Assets
      expect(within(assetsSection).getByText('Damaged Assets')).toBeInTheDocument();
      expect(within(assetsSection).getByText('1')).toBeInTheDocument();

      // Metric 5: Retired Assets
      expect(within(assetsSection).getByText('Retired Assets')).toBeInTheDocument();
      expect(within(assetsSection).getByText('3')).toBeInTheDocument();
    });
  });

  describe('2. Permission and Authorization Handling', () => {
    it('allows access for users with composed permissions (inventory.read, assets.read, billing.read)', () => {
      setupAuth(mockStandardResourceUser);
      (overviewHooks.useResourceOverview as jest.Mock).mockReturnValue({
        data: mockPopulatedOverview,
        isLoading: false,
        isError: false,
        error: null,
        refetch: jest.fn(),
      });

      renderComponent();

      expect(screen.getByTestId('resource-overview-page')).toBeInTheDocument();
      expect(screen.queryByTestId('resource-overview-forbidden')).not.toBeInTheDocument();
    });

    it('denies access when user lacks required composed claims and displays clear guidance', () => {
      setupAuth(mockUnauthorizedUser);
      (overviewHooks.useResourceOverview as jest.Mock).mockReturnValue({
        data: null,
        isLoading: false,
        isError: false,
      });

      renderComponent();

      expect(screen.getByTestId('resource-overview-forbidden')).toBeInTheDocument();
      expect(screen.getByText(/Access Denied: Composed Permissions Required/i)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /View Inventory/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /View Assets/i })).toBeInTheDocument();
      expect(screen.queryByTestId('resource-overview-page')).not.toBeInTheDocument();
    });
  });

  describe('3. Loading, Error, and Empty States', () => {
    it('renders loading skeleton while fetching data', () => {
      (overviewHooks.useResourceOverview as jest.Mock).mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        error: null,
        refetch: jest.fn(),
      });

      renderComponent();

      expect(screen.getByTestId('resource-overview-loading')).toBeInTheDocument();
      expect(screen.getByLabelText(/Loading resource overview/i)).toBeInTheDocument();
    });

    it('renders error state with retry action when query fails', () => {
      const mockRefetch = jest.fn();
      (overviewHooks.useResourceOverview as jest.Mock).mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new Error('Failed to reach resource aggregation service'),
        refetch: mockRefetch,
      });

      renderComponent();

      expect(screen.getByTestId('resource-overview-error')).toBeInTheDocument();
      expect(screen.getByText('Unable to Load Resource Overview')).toBeInTheDocument();
      expect(screen.getByText('Failed to reach resource aggregation service')).toBeInTheDocument();

      const retryBtn = screen.getByRole('button', { name: /Try Again/i });
      fireEvent.click(retryBtn);
      expect(mockRefetch).toHaveBeenCalledTimes(1);
    });

    it('renders empty state when enterprise resource estate has zero items and assets', () => {
      (overviewHooks.useResourceOverview as jest.Mock).mockReturnValue({
        data: mockEmptyOverview,
        isLoading: false,
        isError: false,
        error: null,
        refetch: jest.fn(),
      });

      renderComponent();

      expect(screen.getByTestId('resource-overview-empty')).toBeInTheDocument();
      expect(screen.getByText('No Resource Records Initialized')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Register Product/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Commission Fixed Asset/i })).toBeInTheDocument();
    });

    it('displays intentional zero-state when only inventory is empty', () => {
      (overviewHooks.useResourceOverview as jest.Mock).mockReturnValue({
        data: {
          ...mockPopulatedOverview,
          consumableInventory: {
            totalValueAmount: 0,
            lowStockItemCount: 0,
            totalDistinctItems: 0,
            totalQuantityUnits: 0,
          },
        },
        isLoading: false,
        isError: false,
        error: null,
        refetch: jest.fn(),
      });

      renderComponent();

      expect(screen.getByText('No Products')).toBeInTheDocument();
      expect(screen.getByText('Add products to track inventory levels')).toBeInTheDocument();
    });

    it('displays intentional zero-state when only fixed assets is empty', () => {
      (overviewHooks.useResourceOverview as jest.Mock).mockReturnValue({
        data: {
          ...mockPopulatedOverview,
          fixedAssets: {
            totalCarryingValueAmount: 0,
            activeAssetCount: 0,
            underMaintenanceAssetCount: 0,
            damagedAssetCount: 0,
            retiredAssetCount: 0,
            totalAssetCount: 0,
          },
        },
        isLoading: false,
        isError: false,
        error: null,
        refetch: jest.fn(),
      });

      renderComponent();

      expect(screen.getAllByText('No Assets').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('No equipment registered').length).toBeGreaterThanOrEqual(1);
    });

    it('does not render internal developer badges like "Domain A" or "Domain B"', () => {
      (overviewHooks.useResourceOverview as jest.Mock).mockReturnValue({
        data: mockPopulatedOverview,
        isLoading: false,
        isError: false,
        error: null,
        refetch: jest.fn(),
      });

      renderComponent();

      expect(screen.queryByText('Domain A')).not.toBeInTheDocument();
      expect(screen.queryByText('Domain B')).not.toBeInTheDocument();
      expect(screen.getByText('Resource Distribution')).toBeInTheDocument();
    });
  });

  describe('4. Interactivity and Controls', () => {
    it('triggers refetch when clicking Refresh button', () => {
      const mockRefetch = jest.fn();
      (overviewHooks.useResourceOverview as jest.Mock).mockReturnValue({
        data: mockPopulatedOverview,
        isLoading: false,
        isError: false,
        error: null,
        refetch: mockRefetch,
        isFetching: false,
      });

      renderComponent();

      const refreshBtn = screen.getByRole('button', { name: /Refresh/i });
      fireEvent.click(refreshBtn);
      expect(mockRefetch).toHaveBeenCalledTimes(1);
    });

    it('toggles includeArchived checkbox and passes state to hook', () => {
      (overviewHooks.useResourceOverview as jest.Mock).mockReturnValue({
        data: mockPopulatedOverview,
        isLoading: false,
        isError: false,
        error: null,
        refetch: jest.fn(),
        isFetching: false,
      });

      renderComponent();

      const checkbox = screen.getByLabelText(
        /Include soft-archived and retired items in overview/i,
      );
      expect(checkbox).not.toBeChecked();

      fireEvent.click(checkbox);
      expect(checkbox).toBeChecked();
    });
  });

  describe('5. Accessibility Conventions', () => {
    beforeEach(() => {
      (overviewHooks.useResourceOverview as jest.Mock).mockReturnValue({
        data: mockPopulatedOverview,
        isLoading: false,
        isError: false,
        error: null,
        refetch: jest.fn(),
        isFetching: false,
      });
    });

    it('maintains a proper semantic heading hierarchy (h1 -> h2 -> h3)', () => {
      renderComponent();

      const h1s = screen.getAllByRole('heading', { level: 1 });
      expect(h1s).toHaveLength(1);
      expect(h1s[0]).toHaveTextContent('Resource Overview');

      const h2s = screen.getAllByRole('heading', { level: 2 });
      expect(h2s.length).toBeGreaterThanOrEqual(3);

      const h3s = screen.getAllByRole('heading', { level: 3 });
      expect(h3s.length).toBeGreaterThanOrEqual(9);
    });

    it('ensures status badges include text labels and not color alone', () => {
      renderComponent();

      // Low stock status badge includes text
      expect(screen.getByText('Reorder Required')).toBeInTheDocument();

      // Asset statuses include text
      expect(screen.getByText('In Service')).toBeInTheDocument();
      expect(screen.getByText('Servicing')).toBeInTheDocument();
      expect(screen.getByText('Needs Action')).toBeInTheDocument();
      expect(screen.getByText('Decommissioned')).toBeInTheDocument();
    });
  });
});
