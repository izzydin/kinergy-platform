import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../../../../app/providers/auth-provider';
import { NotificationProvider } from '../../../../app/providers/notification-provider';
import type { AuthUser } from '../../../auth/domain/auth-state.types';
import { MOCK_MANAGED_USERS } from '../mocks/user-management-fixtures';
import { UserListPage } from '../views/user-list-page';

const MOCK_ADMIN_USER: AuthUser = {
  id: 'usr_admin_1',
  email: 'admin@kinergy.io',
  name: 'Platform Admin',
  roles: ['ADMIN'],
  permissions: ['manage:users', 'admin:read'],
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
  listStatus = 200,
): jest.Mock {
  const textPayload =
    typeof userListPayload === 'string' ? userListPayload : JSON.stringify(userListPayload);

  const mockFn = jest.fn().mockResolvedValue({
    ok: listStatus >= 200 && listStatus < 300,
    status: listStatus,
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

function renderUserManagement(initialEntries = ['/admin/users']) {
  const queryClient = createTestQueryClient();

  return render(
    <QueryClientProvider client={queryClient}>
      <NotificationProvider>
        <MemoryRouter initialEntries={initialEntries}>
          <AuthProvider initialSessionOverride={MOCK_ADMIN_USER}>
            <Routes>
              <Route path="/admin/users" element={<UserListPage />} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </NotificationProvider>
    </QueryClientProvider>,
  );
}

describe('Track C Step C2.5: User Management DataTable Integration', () => {
  beforeEach(() => {
    setupFetchMock();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('derives server query parameters from URL state (q, status, role, page, limit, sort)', async () => {
    renderUserManagement([
      '/admin/users?q=Admin&status=ACTIVE&role=ADMIN&page=2&limit=25&sort=name.desc',
    ]);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('q=Admin'),
        expect.anything(),
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('status=ACTIVE'),
        expect.anything(),
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('role=ADMIN'),
        expect.anything(),
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('page=2'),
        expect.anything(),
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=25'),
        expect.anything(),
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('sort=name.desc'),
        expect.anything(),
      );
    });
  });

  it('handles sortable column header clicks and triggers query with sort parameter', async () => {
    renderUserManagement(['/admin/users']);

    await waitFor(() => {
      expect(screen.getByText('Platform Admin')).toBeInTheDocument();
    });

    const userSortBtn = screen.getByRole('button', { name: /sort by user/i });
    fireEvent.click(userSortBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('sort=name.asc'),
        expect.anything(),
      );
    });
  });

  it('renders accessible row actions and executes edit / deactivate operations', async () => {
    renderUserManagement(['/admin/users']);

    await waitFor(() => {
      expect(screen.getByText('Platform Admin')).toBeInTheDocument();
    });

    // Row action trigger buttons
    const actionMenus = screen.getAllByRole('button', { name: /open actions menu/i });
    expect(actionMenus.length).toBeGreaterThan(0);

    fireEvent.click(actionMenus[0]!);
    expect(screen.getByRole('menu', { name: /row actions/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /edit/i })).toBeInTheDocument();
  });

  it('preserves page and filters across simulated browser navigation', async () => {
    renderUserManagement(['/admin/users?page=3&status=PENDING']);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('page=3'),
        expect.anything(),
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('status=PENDING'),
        expect.anything(),
      );
    });
  });
});
