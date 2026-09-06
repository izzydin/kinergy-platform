import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../../../../app/providers/auth-provider';
import { NotificationProvider } from '../../../../app/providers/notification-provider';
import { FeatureFlagProvider } from '../../../../app/providers/feature-flag-provider';
import { NavigationProvider } from '../../../../app/navigation/navigation-provider';
import { BreadcrumbProvider } from '../../../../app/breadcrumbs/breadcrumb-provider';
import { SlotProvider } from '../../../../shared/ui/slots';
import { AppRouter } from '../../../../app/routes/app-router';
import type { AuthUser } from '../../../auth/domain/auth-state.types';
import * as overviewHooks from '../hooks/use-resource-overview';

jest.mock('../hooks/use-resource-overview', () => ({
  useResourceOverview: jest.fn(),
}));

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
}

const AUTHORIZED_EXECUTIVE: AuthUser = {
  id: 'usr-exec',
  email: 'exec@kinergy.io',
  name: 'Executive Leader',
  roles: ['ADMIN'],
  permissions: ['inventory.read', 'assets.read', 'billing.read'],
  tenantId: 'tenant-test',
};

const AUTHORIZED_OPERATOR: AuthUser = {
  id: 'usr-res-op',
  email: 'res-op@kinergy.io',
  name: 'Resource Operator',
  roles: ['OPERATOR'],
  permissions: ['inventory.read', 'assets.read', 'billing.read'],
  tenantId: 'tenant-test',
};

const UNAUTHORIZED_USER: AuthUser = {
  id: 'usr-unauth',
  email: 'member@kinergy.io',
  name: 'General Member',
  roles: ['MEMBER'],
  permissions: ['client:read'],
  tenantId: 'tenant-test',
};

function renderWithRoute(initialEntry: string, user: AuthUser) {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <SlotProvider>
          <NotificationProvider>
            <AuthProvider initialSessionOverride={user}>
              <FeatureFlagProvider>
                <NavigationProvider>
                  <BreadcrumbProvider>
                    <AppRouter />
                  </BreadcrumbProvider>
                </NavigationProvider>
              </FeatureFlagProvider>
            </AuthProvider>
          </NotificationProvider>
        </SlotProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Resource Overview SubRouter Routing & Protection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (overviewHooks.useResourceOverview as jest.Mock).mockReturnValue({
      data: {
        consumableInventory: {
          totalValueAmount: 50000,
          lowStockItemCount: 2,
          totalDistinctItems: 10,
          totalQuantityUnits: 500,
        },
        fixedAssets: {
          totalCarryingValueAmount: 150000,
          activeAssetCount: 5,
          underMaintenanceAssetCount: 1,
          damagedAssetCount: 0,
          retiredAssetCount: 0,
          totalAssetCount: 6,
        },
        combined: {
          totalCombinedValueAmount: 200000,
        },
        currency: 'USD',
        calculatedAt: '2026-09-06T15:00:00.000Z',
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
      isFetching: false,
    });
  });

  it('renders ResourceOverviewPage at /resources index route for authorized executive', async () => {
    renderWithRoute('/resources', AUTHORIZED_EXECUTIVE);
    expect(await screen.findByTestId('resource-overview-page')).toBeInTheDocument();
    expect(screen.getByText('Combined Resource Value')).toBeInTheDocument();
  });

  it('renders ResourceOverviewPage at /resources/overview for authorized operator', async () => {
    renderWithRoute('/resources/overview', AUTHORIZED_OPERATOR);
    expect(await screen.findByTestId('resource-overview-page')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: /Consumable Inventory/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /Fixed Assets/i })).toBeInTheDocument();
  });

  it('denies access with 403 Forbidden for unauthorized user without resource permissions', async () => {
    renderWithRoute('/resources/overview', UNAUTHORIZED_USER);
    expect(
      await screen.findByRole('heading', { name: /403 — Access Denied/i }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('resource-overview-page')).not.toBeInTheDocument();
  });
});
