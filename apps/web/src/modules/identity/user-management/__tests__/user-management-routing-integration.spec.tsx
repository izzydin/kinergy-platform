import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { BreadcrumbProvider } from '../../../../app/breadcrumbs/breadcrumb-provider';
import { NavigationProvider } from '../../../../app/navigation/navigation-provider';
import { navigationRegistry } from '../../../../app/navigation/navigation-registry';
import { AuthProvider } from '../../../../app/providers/auth-provider';
import { FeatureFlagProvider } from '../../../../app/providers/feature-flag-provider';
import { NotificationProvider } from '../../../../app/providers/notification-provider';
import { AppRouter } from '../../../../app/routes/app-router';
import { moduleRegistry } from '../../../../app/routes/module-registry';
import { SlotProvider } from '../../../../shared/ui/slots';
import type { AuthUser } from '../../../auth/domain/auth-state.types';
import { MOCK_MANAGED_USERS } from '../mocks/user-management-fixtures';

const MOCK_ADMIN_USER: AuthUser = {
  id: 'usr_admin_999',
  email: 'admin@kinergy.io',
  name: 'Platform Admin',
  roles: ['ADMIN'],
  permissions: ['manage:users', 'admin:read'],
  tenantId: 'tenant_kinergy_master',
};

const MOCK_MEMBER_USER: AuthUser = {
  id: 'usr_member_888',
  email: 'member@kinergy.io',
  name: 'Regular Member',
  roles: ['MEMBER'],
  permissions: ['energy:read'],
  tenantId: 'tenant_kinergy_master',
};

function setupFetchMock(
  userListPayload: unknown = {
    items: MOCK_MANAGED_USERS,
    total: 5,
    page: 1,
    limit: 10,
    totalPages: 1,
  },
): jest.Mock {
  const textPayload =
    typeof userListPayload === 'string' ? userListPayload : JSON.stringify(userListPayload);

  const mockFn = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: () => Promise.resolve(textPayload),
    json: () => Promise.resolve(userListPayload),
  } as Response);

  global.fetch = mockFn as unknown as typeof fetch;
  return mockFn;
}

function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

function renderAppAtRoute(route: string, user: AuthUser | null) {
  const queryClient = createTestQueryClient();

  return render(
    <QueryClientProvider client={queryClient}>
      <NotificationProvider>
        <AuthProvider initialSessionOverride={user}>
          <FeatureFlagProvider>
            <SlotProvider>
              <MemoryRouter initialEntries={[route]}>
                <NavigationProvider>
                  <BreadcrumbProvider>
                    <AppRouter />
                  </BreadcrumbProvider>
                </NavigationProvider>
              </MemoryRouter>
            </SlotProvider>
          </FeatureFlagProvider>
        </AuthProvider>
      </NotificationProvider>
    </QueryClientProvider>,
  );
}

describe('User Management Routing & Module API Integration', () => {
  beforeEach(() => {
    setupFetchMock();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('registers user-management protected module in moduleRegistry', () => {
    const protectedModules = moduleRegistry.getProtectedModules();
    const userMgmtModule = protectedModules.find(
      (m: { readonly id: string }) => m.id === 'user-management',
    );

    expect(userMgmtModule).toBeDefined();
    expect(userMgmtModule?.prefix).toBe('/admin/users');
    expect(userMgmtModule?.isProtected).toBe(true);
    expect(userMgmtModule?.requiredPermissions).toEqual(['manage:users']);
  });

  it('registers user-management navigation item in navigationRegistry', () => {
    const navItems = navigationRegistry.getItems();
    const userMgmtItem = navItems.find((i: { readonly id: string }) => i.id === 'user-management');

    expect(userMgmtItem).toBeDefined();
    expect(userMgmtItem?.path).toBe('/admin/users');
    expect(userMgmtItem?.section).toBe('admin');
    expect(userMgmtItem?.requiredPermissions).toEqual(['manage:users']);
  });

  it('renders UserListPage when navigating to /admin/users as authorized admin user', async () => {
    renderAppAtRoute('/admin/users', MOCK_ADMIN_USER);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /user management/i })).toBeInTheDocument();
    });

    expect(screen.getByText('Platform Admin')).toBeInTheDocument();
  });

  it('renders Forbidden view when navigating to /admin/users as unauthorized member without manage:users permission', async () => {
    renderAppAtRoute('/admin/users', MOCK_MEMBER_USER);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /403.*Access Denied/i })).toBeInTheDocument();
    });
  });
});
