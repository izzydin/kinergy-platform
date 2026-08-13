import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../../../../../app/providers/auth-provider';
import { NotificationProvider } from '../../../../../app/providers/notification-provider';
import type { AuthUser } from '../../../../auth/domain/auth-state.types';
import { MOCK_MANAGED_USERS } from '../../mocks/user-management-fixtures';
import { UserListPage } from '../user-list-page';

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

function renderUserListPage(initialEntries = ['/admin/users']) {
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

describe('UserListPage Component & 4-State UI Contract', () => {
  beforeEach(() => {
    setupFetchMock();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('1. Populated State', () => {
    it('renders user list header, filter bar, and populated user table', async () => {
      renderUserListPage();

      expect(screen.getByRole('heading', { name: /user management/i })).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByText('Platform Admin')).toBeInTheDocument();
      });

      expect(screen.getByText('admin@kinergy.io')).toBeInTheDocument();
      expect(screen.getByText('Grid Operator')).toBeInTheDocument();
      expect(screen.getByText('Energy Member')).toBeInTheDocument();
    });

    it('renders semantic status badges for users', async () => {
      renderUserListPage();

      await waitFor(() => {
        expect(screen.getByText('Platform Admin')).toBeInTheDocument();
      });

      // 1 select option + 2 table row status badges = 3 'Active' texts
      expect(screen.getAllByText('Active')).toHaveLength(3);
      expect(screen.getAllByText('Inactive')).toHaveLength(2); // 1 select option + 1 table row badge
      expect(screen.getAllByText('Pending')).toHaveLength(2); // 1 select option + 1 table row badge
      expect(screen.getAllByText('Blocked')).toHaveLength(2); // 1 select option + 1 table row badge
    });
  });

  describe('2. URL Search & Filtering', () => {
    it('updates search query in URL and triggers filtered query', async () => {
      renderUserListPage(['/admin/users']);

      await waitFor(() => {
        expect(screen.getByText('Platform Admin')).toBeInTheDocument();
      });

      const searchInput = screen.getByLabelText(/search users by name or email/i);
      fireEvent.change(searchInput, { target: { value: 'Operator' } });
      fireEvent.blur(searchInput);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('q=Operator'),
          expect.anything(),
        );
      });
    });

    it('updates status filter in URL when select dropdown changes', async () => {
      renderUserListPage(['/admin/users']);

      await waitFor(() => {
        expect(screen.getByText('Platform Admin')).toBeInTheDocument();
      });

      const statusSelect = screen.getByLabelText(/filter by user status/i);
      fireEvent.change(statusSelect, { target: { value: 'INACTIVE' } });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('status=INACTIVE'),
          expect.anything(),
        );
      });
    });
  });

  describe('3. Empty States (System Empty vs Filtered Empty)', () => {
    it('renders System Empty view when system has zero users', async () => {
      setupFetchMock({
        items: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
      });

      renderUserListPage(['/admin/users']);

      await waitFor(() => {
        expect(screen.getByText('No user accounts found')).toBeInTheDocument();
      });

      expect(
        screen.getByText(/there are currently no user accounts registered/i),
      ).toBeInTheDocument();
    });

    it('renders Filtered Empty view when search query matches zero users', async () => {
      setupFetchMock({
        items: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
      });

      renderUserListPage(['/admin/users?q=NonExistentUser']);

      await waitFor(() => {
        expect(screen.getByText('No users matching search filters')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /reset filters/i })).toBeInTheDocument();
    });
  });

  describe('4. Error State & Retry Action', () => {
    it('renders Error Alert banner when user query fails and allows retry', async () => {
      setupFetchMock('Database query failed to fetch user accounts', 500);

      renderUserListPage();

      await waitFor(() => {
        expect(screen.getByText('Operation Failed')).toBeInTheDocument();
      });

      expect(screen.getByText(/HTTP 500/i)).toBeInTheDocument();

      const retryButton = screen.getByRole('button', { name: /try again/i });
      expect(retryButton).toBeInTheDocument();
    });
  });

  describe('5. Domain Mutation Actions', () => {
    it('executes deactivation when Deactivate button is clicked', async () => {
      renderUserListPage();

      await waitFor(() => {
        expect(screen.getByText('Platform Admin')).toBeInTheDocument();
      });

      const deactivateButtons = screen.getAllByRole('button', {
        name: /deactivate user account for/i,
      });
      expect(deactivateButtons.length).toBeGreaterThan(0);

      fireEvent.click(deactivateButtons[0]!);

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: /deactivate user account/i }),
        ).toBeInTheDocument();
      });

      const confirmBtn = screen.getByRole('button', { name: /^deactivate user$/i });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/deactivate'),
          expect.objectContaining({ method: 'POST' }),
        );
      });
    });

    it('executes activation when Activate button is clicked', async () => {
      renderUserListPage();

      await waitFor(() => {
        expect(screen.getByText('Energy Member')).toBeInTheDocument();
      });

      const activateButton = screen.getByRole('button', {
        name: /activate user account for energy member/i,
      });
      fireEvent.click(activateButton);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/activate'),
          expect.objectContaining({ method: 'POST' }),
        );
      });
    });
  });
});
