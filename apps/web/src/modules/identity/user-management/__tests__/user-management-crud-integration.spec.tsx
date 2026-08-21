import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { AuthProvider } from '../../../../app/providers/auth-provider';
import { NotificationProvider } from '../../../../app/providers/notification-provider';
import type { AuthUser } from '../../../auth/domain/auth-state.types';
import * as userApi from '../api/user-management-api';
import type { ManagedUser } from '../domain/user.types';
import { MOCK_MANAGED_USERS } from '../mocks/user-management-fixtures';
import { UserListPage } from '../views/user-list-page';

// Polyfill global.Request for react-router v6 data router in JSDOM
if (typeof global.Request === 'undefined') {
  global.Request = class Request {} as unknown as typeof Request;
}

// Mock API layer
jest.mock('../api/user-management-api', () => ({
  fetchUsers: jest.fn(),
  fetchUserById: jest.fn(),
  createUser: jest.fn(),
  updateUser: jest.fn(),
  activateUser: jest.fn(),
  deactivateUser: jest.fn(),
}));

const mockedApi = jest.mocked(userApi);

const MOCK_ADMIN_USER: AuthUser = {
  id: 'usr_admin_1',
  email: 'admin@kinergy.io',
  name: 'Platform Admin',
  roles: ['ADMIN'],
  permissions: ['manage:users', 'admin:read', 'client:read'],
  tenantId: 'tenant_kinergy_master',
};

const MOCK_UNAUTHORIZED_USER: AuthUser = {
  id: 'usr_member_1',
  email: 'member@kinergy.io',
  name: 'Energy Member',
  roles: ['MEMBER'],
  permissions: ['client:read'],
  tenantId: 'tenant_kinergy_master',
};

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

function renderUserManagement(
  initialEntries = ['/users'],
  authUser: AuthUser = MOCK_ADMIN_USER,
  queryClient = createTestQueryClient(),
) {
  const router = createMemoryRouter(
    [
      {
        path: '/users',
        element: <UserListPage />,
      },
    ],
    { initialEntries },
  );

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider initialSessionOverride={authUser}>
        <NotificationProvider>
          <RouterProvider router={router} />
        </NotificationProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('Track C Step C3.4: CRUD Experience Integration with User Management', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('1. USER LIST — 5 Mandatory States Matrix', () => {
    it('renders loading skeleton while query is fetching', () => {
      mockedApi.fetchUsers.mockReturnValue(new Promise(() => {}));
      renderUserManagement();

      expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument();
      expect(screen.queryByText('Platform Admin')).not.toBeInTheDocument();
    });

    it('renders populated state with user records, status badges, and roles', async () => {
      mockedApi.fetchUsers.mockResolvedValue({
        items: [...MOCK_MANAGED_USERS],
        total: 5,
        page: 1,
        limit: 10,
        totalPages: 1,
      });

      renderUserManagement();

      await waitFor(() => {
        expect(screen.getByText('Platform Admin')).toBeInTheDocument();
      });

      expect(screen.getByText('admin@kinergy.io')).toBeInTheDocument();
      expect(screen.getByText('Grid Operator')).toBeInTheDocument();
      expect(screen.getByText('Energy Member')).toBeInTheDocument();
    });

    it('renders system empty state when 0 records exist', async () => {
      mockedApi.fetchUsers.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
      });

      renderUserManagement();

      await waitFor(() => {
        expect(screen.getByText('No user accounts found')).toBeInTheDocument();
      });

      expect(
        screen.getByText('There are currently no user accounts registered in the platform.'),
      ).toBeInTheDocument();
    });

    it('renders filtered empty state when filter criteria matches 0 records', async () => {
      mockedApi.fetchUsers.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
      });

      renderUserManagement(['/users?q=NonExistentUser']);

      await waitFor(() => {
        expect(screen.getByText('No users matching search filters')).toBeInTheDocument();
      });

      expect(
        screen.getByText(
          'Try broadening your search query or clearing active status/role filters.',
        ),
      ).toBeInTheDocument();
    });

    it('renders error state when query fails and allows retry', async () => {
      mockedApi.fetchUsers
        .mockRejectedValueOnce(new Error('Identity API Unavailable'))
        .mockResolvedValueOnce({
          items: [...MOCK_MANAGED_USERS],
          total: 5,
          page: 1,
          limit: 10,
          totalPages: 1,
        });

      renderUserManagement();

      await waitFor(() => {
        expect(screen.getByText('Identity API Unavailable')).toBeInTheDocument();
      });

      const retryBtn = screen.getByRole('button', { name: /retry/i });
      fireEvent.click(retryBtn);

      await waitFor(() => {
        expect(screen.getByText('Platform Admin')).toBeInTheDocument();
      });
    });
  });

  describe('2. CREATE USER — Lifecycle & Mutation', () => {
    beforeEach(() => {
      mockedApi.fetchUsers.mockResolvedValue({
        items: [...MOCK_MANAGED_USERS],
        total: 5,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
    });

    it('opens create modal, enforces validation, and creates user successfully', async () => {
      const newUser: ManagedUser = {
        id: 'usr_006',
        email: 'carol.operator@kinergy.io',
        name: 'Carol Operator',
        roles: ['OPERATOR'],
        permissions: ['energy:read'],
        status: 'ACTIVE',
        tenantId: 'tenant_kinergy_master',
        lastLoginAt: null,
        createdAt: '2026-08-21T10:00:00.000Z',
        updatedAt: '2026-08-21T10:00:00.000Z',
      };

      mockedApi.createUser.mockResolvedValue(newUser);

      renderUserManagement();

      await waitFor(() => {
        expect(screen.getByText('Platform Admin')).toBeInTheDocument();
      });

      // Open Create Modal
      const openCreateBtn = screen.getByRole('button', { name: /create new user account/i });
      fireEvent.click(openCreateBtn);

      expect(screen.getByRole('dialog')).toBeInTheDocument();

      // Trigger empty submit to test validation summary
      const submitBtn = screen.getByRole('button', { name: /create account/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getAllByText(/email address is required/i).length).toBeGreaterThanOrEqual(1);
      });

      // Fill in valid data
      fireEvent.change(screen.getByLabelText(/email address/i), {
        target: { value: 'carol.operator@kinergy.io' },
      });
      fireEvent.change(screen.getByLabelText(/full name/i), {
        target: { value: 'Carol Operator' },
      });
      fireEvent.change(screen.getByLabelText(/access role/i), {
        target: { value: 'OPERATOR' },
      });

      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(mockedApi.createUser).toHaveBeenCalledWith(
          expect.objectContaining({
            email: 'carol.operator@kinergy.io',
            name: 'Carol Operator',
            role: 'OPERATOR',
          }),
        );
      });
    });

    it('handles duplicate email mutation error (409) gracefully', async () => {
      mockedApi.createUser.mockRejectedValue({
        statusCode: 409,
        message: 'A user account with this email address already exists.',
      });

      renderUserManagement();

      await waitFor(() => {
        expect(screen.getByText('Platform Admin')).toBeInTheDocument();
      });

      const openCreateBtn = screen.getByRole('button', { name: /create new user account/i });
      fireEvent.click(openCreateBtn);

      fireEvent.change(screen.getByLabelText(/email address/i), {
        target: { value: 'admin@kinergy.io' },
      });
      fireEvent.change(screen.getByLabelText(/full name/i), {
        target: { value: 'Alice Duplicate' },
      });

      const submitBtn = screen.getByRole('button', { name: /create account/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(
          screen.getAllByText('A user account with this email address already exists.').length,
        ).toBeGreaterThanOrEqual(1);
      });
    });
  });

  describe('3. EDIT USER — Lifecycle & Mutation', () => {
    beforeEach(() => {
      mockedApi.fetchUsers.mockResolvedValue({
        items: [...MOCK_MANAGED_USERS],
        total: 5,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
    });

    it('opens edit modal with target user data and updates user profile', async () => {
      const updatedUser: ManagedUser = {
        ...MOCK_MANAGED_USERS[0]!,
        name: 'Platform Admin Updated',
        roles: ['ADMIN'],
      };

      mockedApi.updateUser.mockResolvedValue(updatedUser);

      renderUserManagement();

      await waitFor(() => {
        expect(screen.getByText('Platform Admin')).toBeInTheDocument();
      });

      // Click Edit Quick Action for first user
      const editButton = screen.getByRole('button', {
        name: /edit details for user platform admin/i,
      });
      fireEvent.click(editButton);

      // Verify Edit Modal rendered with existing data
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByDisplayValue('admin@kinergy.io')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Platform Admin')).toBeInTheDocument();

      // Modify Name
      const nameInput = screen.getByLabelText(/full name/i);
      fireEvent.change(nameInput, { target: { value: 'Platform Admin Updated' } });

      // Submit form
      const saveBtn = screen.getByRole('button', { name: /save changes/i });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(mockedApi.updateUser).toHaveBeenCalledWith('usr_admin_1', {
          name: 'Platform Admin Updated',
          role: 'ADMIN',
        });
      });
    });
  });

  describe('4. ACTIVATE & DEACTIVATE STATUS MUTATIONS', () => {
    beforeEach(() => {
      mockedApi.fetchUsers.mockResolvedValue({
        items: [...MOCK_MANAGED_USERS],
        total: 5,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
    });

    it('activates an inactive user directly from quick action button', async () => {
      mockedApi.activateUser.mockResolvedValue({
        ...MOCK_MANAGED_USERS[2]!,
        status: 'ACTIVE',
      });

      renderUserManagement();

      await waitFor(() => {
        expect(screen.getByText('Energy Member')).toBeInTheDocument();
      });

      // Energy Member is INACTIVE
      const activateButton = screen.getByRole('button', {
        name: /activate user account for energy member/i,
      });
      fireEvent.click(activateButton);

      await waitFor(() => {
        expect(mockedApi.activateUser).toHaveBeenCalledWith('usr_member_1');
      });
    });

    it('opens deactivation confirmation dialog and deactivates active user upon confirm', async () => {
      mockedApi.deactivateUser.mockResolvedValue({
        ...MOCK_MANAGED_USERS[0]!,
        status: 'INACTIVE',
      });

      renderUserManagement();

      await waitFor(() => {
        expect(screen.getByText('Platform Admin')).toBeInTheDocument();
      });

      // Platform Admin is ACTIVE
      const deactivateButton = screen.getByRole('button', {
        name: /deactivate user account for platform admin/i,
      });
      fireEvent.click(deactivateButton);

      // Verify Deactivate confirmation dialog appears
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText(/are you sure you want to deactivate/i)).toBeInTheDocument();

      // Confirm Deactivation
      const confirmBtn = screen.getByRole('button', { name: /deactivate user/i });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(mockedApi.deactivateUser).toHaveBeenCalledWith('usr_admin_1');
      });
    });
  });

  describe('5. AUTHORIZATION BOUNDARY ENFORCEMENT', () => {
    it('hides create action and management actions for unauthorized users', async () => {
      mockedApi.fetchUsers.mockResolvedValue({
        items: [...MOCK_MANAGED_USERS],
        total: 5,
        page: 1,
        limit: 10,
        totalPages: 1,
      });

      renderUserManagement(['/users'], MOCK_UNAUTHORIZED_USER);

      await waitFor(() => {
        expect(screen.getByText('Platform Admin')).toBeInTheDocument();
      });

      // Create button in toolbar is not rendered for unprivileged user
      expect(
        screen.queryByRole('button', { name: /create new user account/i }),
      ).not.toBeInTheDocument();

      // Direct edit/activate/deactivate buttons should not render for unprivileged user
      expect(
        screen.queryByRole('button', { name: /edit details for user/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /deactivate user account/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /activate user account/i }),
      ).not.toBeInTheDocument();
    });
  });
});
