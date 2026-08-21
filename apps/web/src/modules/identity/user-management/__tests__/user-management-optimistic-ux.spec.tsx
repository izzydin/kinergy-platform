import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';

import { AuthProvider } from '../../../../app/providers/auth-provider';
import {
  NotificationProvider,
  notificationService,
} from '../../../../app/providers/notification-provider';
import type { AuthUser } from '../../../auth/domain/auth-state.types';
import type { ManagedUser } from '../domain/user.types';
import { UserListPage } from '../views/user-list-page';
import * as api from '../api/user-management-api';

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

const MOCK_ADMIN_USER: AuthUser = {
  id: 'usr_admin',
  email: 'admin@kinergy.test',
  name: 'Platform Admin',
  roles: ['ADMIN'],
  permissions: ['manage:users', 'admin:read'],
  tenantId: 'tenant_1',
};

const MOCK_MEMBER_USER: AuthUser = {
  id: 'usr_member',
  email: 'member@kinergy.test',
  name: 'Member User',
  roles: ['MEMBER'],
  permissions: [],
  tenantId: 'tenant_1',
};

const mockActiveUser: ManagedUser = {
  id: 'usr_active',
  name: 'Active User',
  email: 'active@kinergy.test',
  status: 'ACTIVE',
  roles: ['OPERATOR'],
  permissions: ['manage:users'],
  tenantId: 'tenant_1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  lastLoginAt: '2026-08-01T00:00:00.000Z',
};

const mockInactiveUser: ManagedUser = {
  id: 'usr_inactive',
  name: 'Inactive User',
  email: 'inactive@kinergy.test',
  status: 'INACTIVE',
  roles: ['MEMBER'],
  permissions: [],
  tenantId: 'tenant_1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  lastLoginAt: null,
};

describe('Track C — Step C4.3: User Management Optimistic UX Validation', () => {
  let queryClient: QueryClient;

  const renderWithProviders = (
    initialUsers: ManagedUser[] = [mockActiveUser, mockInactiveUser],
    authUser: AuthUser = MOCK_ADMIN_USER,
  ) => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
        mutations: { retry: false },
      },
    });

    jest.spyOn(api, 'fetchUsers').mockResolvedValue({
      items: initialUsers,
      total: initialUsers.length,
      page: 1,
      limit: 10,
      totalPages: 1,
    });

    const routes = [
      {
        path: '/admin/users',
        element: <UserListPage />,
      },
    ];

    const router = createMemoryRouter(routes, {
      initialEntries: ['/admin/users'],
    });

    return render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider initialSessionOverride={authUser}>
          <NotificationProvider>
            <RouterProvider router={router} />
          </NotificationProvider>
        </AuthProvider>
      </QueryClientProvider>,
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('1. User Activation (Optimistic Lifecycle)', () => {
    it('applies optimistic ACTIVE status immediately before server resolution and reconciles on success', async () => {
      let resolveApi!: (val: ManagedUser) => void;
      const pendingApi = new Promise<ManagedUser>((res) => {
        resolveApi = res;
      });

      jest.spyOn(api, 'activateUser').mockImplementation(() => pendingApi);
      const notifySuccessSpy = jest.spyOn(notificationService, 'success');

      renderWithProviders([mockInactiveUser]);

      // Verify initial state is Inactive in table
      await waitFor(() => {
        expect(screen.getByText('Inactive User')).toBeInTheDocument();
      });
      const table = screen.getByRole('table');
      expect(within(table).getByText('Inactive')).toBeInTheDocument();

      // Find quick Activate button
      const activateButton = screen.getByRole('button', {
        name: /Activate user account for Inactive User/i,
      });
      fireEvent.click(activateButton);

      // Verify OPTIMISTIC UPDATE: Status badge changes to Active immediately BEFORE resolveApi
      await waitFor(() => {
        expect(within(table).getByText('Active')).toBeInTheDocument();
      });

      // Settle server response
      act(() => {
        resolveApi({ ...mockInactiveUser, status: 'ACTIVE' });
      });

      // Verify server reconciliation and success notification
      await waitFor(() => {
        expect(notifySuccessSpy).toHaveBeenCalledWith(
          'User Activated',
          expect.stringContaining('activated'),
          undefined,
        );
      });
    });

    it('rolls back to INACTIVE status and shows error toast when activation API fails', async () => {
      let rejectApi!: (err: Error) => void;
      const pendingApi = new Promise<ManagedUser>((_, rej) => {
        rejectApi = rej;
      });

      jest.spyOn(api, 'activateUser').mockImplementation(() => pendingApi);
      const notifyErrorSpy = jest.spyOn(notificationService, 'error');

      renderWithProviders([mockInactiveUser]);

      await waitFor(() => {
        expect(screen.getByText('Inactive User')).toBeInTheDocument();
      });

      const table = screen.getByRole('table');
      const activateButton = screen.getByRole('button', {
        name: /Activate user account for Inactive User/i,
      });
      fireEvent.click(activateButton);

      // Optimistically shows Active in table
      await waitFor(() => {
        expect(within(table).getByText('Active')).toBeInTheDocument();
      });

      // Reject API request
      act(() => {
        rejectApi(new Error('Internal network error'));
      });

      // Verify ROLLBACK: Status badge reverts back to Inactive in table
      await waitFor(() => {
        expect(within(table).getByText('Inactive')).toBeInTheDocument();
      });

      // Verify error notification
      expect(notifyErrorSpy).toHaveBeenCalledWith(
        expect.any(Error),
        'Failed to activate user account.',
        undefined,
      );
    });
  });

  describe('2. User Deactivation (Optimistic Lifecycle)', () => {
    it('applies optimistic INACTIVE status immediately upon modal confirmation and reconciles on success', async () => {
      let resolveApi!: (val: ManagedUser) => void;
      const pendingApi = new Promise<ManagedUser>((res) => {
        resolveApi = res;
      });

      jest.spyOn(api, 'deactivateUser').mockImplementation(() => pendingApi);
      const notifySuccessSpy = jest.spyOn(notificationService, 'success');

      renderWithProviders([mockActiveUser]);

      await waitFor(() => {
        expect(screen.getByText('Active User')).toBeInTheDocument();
      });
      const table = screen.getByRole('table');
      expect(within(table).getByText('Active')).toBeInTheDocument();

      // Click quick Deactivate button
      const deactivateButton = screen.getByRole('button', {
        name: /Deactivate user account for Active User/i,
      });
      fireEvent.click(deactivateButton);

      // Confirm in dialog
      const confirmButton = await screen.findByRole('button', { name: 'Deactivate User' });
      fireEvent.click(confirmButton);

      // Verify OPTIMISTIC UPDATE: Badge changes to Inactive immediately in table
      await waitFor(() => {
        expect(within(table).getByText('Inactive')).toBeInTheDocument();
      });

      // Settle server response
      act(() => {
        resolveApi({ ...mockActiveUser, status: 'INACTIVE' });
      });

      // Verify success notification
      await waitFor(() => {
        expect(notifySuccessSpy).toHaveBeenCalledWith(
          'User Deactivated',
          expect.stringContaining('deactivated'),
          undefined,
        );
      });
    });

    it('rolls back to ACTIVE status and shows error toast when deactivation API fails', async () => {
      let rejectApi!: (err: Error) => void;
      const pendingApi = new Promise<ManagedUser>((_, rej) => {
        rejectApi = rej;
      });

      jest.spyOn(api, 'deactivateUser').mockImplementation(() => pendingApi);
      const notifyErrorSpy = jest.spyOn(notificationService, 'error');

      renderWithProviders([mockActiveUser]);

      await waitFor(() => {
        expect(screen.getByText('Active User')).toBeInTheDocument();
      });

      const table = screen.getByRole('table');
      const deactivateButton = screen.getByRole('button', {
        name: /Deactivate user account for Active User/i,
      });
      fireEvent.click(deactivateButton);

      const confirmButton = await screen.findByRole('button', { name: 'Deactivate User' });
      fireEvent.click(confirmButton);

      // Optimistically shows Inactive in table
      await waitFor(() => {
        expect(within(table).getByText('Inactive')).toBeInTheDocument();
      });

      // Server failure
      act(() => {
        rejectApi(new Error('Deactivation rejected'));
      });

      // Verify ROLLBACK: Status reverts to Active in table
      await waitFor(() => {
        expect(within(table).getByText('Active')).toBeInTheDocument();
      });

      expect(notifyErrorSpy).toHaveBeenCalledWith(
        expect.any(Error),
        'Failed to deactivate user account.',
        undefined,
      );
    });
  });

  describe('3. User Creation (Pessimistic Classification)', () => {
    it('remains strictly pessimistic: keeps modal open with spinner and updates list only after server confirmation', async () => {
      let resolveApi!: (val: ManagedUser) => void;
      const pendingApi = new Promise<ManagedUser>((res) => {
        resolveApi = res;
      });

      jest.spyOn(api, 'createUser').mockImplementation(() => pendingApi);
      const notifySuccessSpy = jest.spyOn(notificationService, 'success');

      renderWithProviders([mockActiveUser]);

      await waitFor(() => {
        expect(screen.getByText('Active User')).toBeInTheDocument();
      });

      // Open Create User Dialog via accessible label 'Create new user account'
      const createButton = screen.getByRole('button', { name: /Create new user account/i });
      fireEvent.click(createButton);

      const nameInput = screen.getByLabelText(/Full Name/i);
      const emailInput = screen.getByLabelText(/Email Address/i);

      fireEvent.change(nameInput, { target: { value: 'Brand New User' } });
      fireEvent.change(emailInput, { target: { value: 'newuser@kinergy.test' } });

      const submitButton = screen.getByRole('button', { name: /Create Account/i });
      fireEvent.click(submitButton);

      // Verify PESSIMISTIC: Modal remains open and button is disabled during in-flight mutation
      expect(screen.getByRole('button', { name: /Creating User.../i })).toBeDisabled();
      expect(screen.queryByText('Brand New User')).not.toBeInTheDocument();

      // Settle server response
      const createdUser: ManagedUser = {
        id: 'usr_new_999',
        name: 'Brand New User',
        email: 'newuser@kinergy.test',
        status: 'ACTIVE',
        roles: ['MEMBER'],
        permissions: [],
        tenantId: 'tenant_1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastLoginAt: null,
      };

      // Mock list refetch to return updated list
      jest.spyOn(api, 'fetchUsers').mockResolvedValue({
        items: [mockActiveUser, createdUser],
        total: 2,
        page: 1,
        limit: 10,
        totalPages: 1,
      });

      act(() => {
        resolveApi(createdUser);
      });

      // Verify modal closes and notification fired
      await waitFor(() => {
        expect(screen.queryByRole('heading', { name: /Create New User/i })).not.toBeInTheDocument();
      });
      expect(notifySuccessSpy).toHaveBeenCalledWith(
        'User Created',
        expect.stringContaining('created successfully'),
        undefined,
      );
    });
  });

  describe('4. User Edit (Pessimistic Classification)', () => {
    it('remains strictly pessimistic: keeps modal open and applies updates only after server response', async () => {
      let resolveApi!: (val: ManagedUser) => void;
      const pendingApi = new Promise<ManagedUser>((res) => {
        resolveApi = res;
      });

      jest.spyOn(api, 'updateUser').mockImplementation(() => pendingApi);
      const notifySuccessSpy = jest.spyOn(notificationService, 'success');

      renderWithProviders([mockActiveUser]);

      await waitFor(() => {
        expect(screen.getByText('Active User')).toBeInTheDocument();
      });

      // Click Edit
      const editButton = screen.getByRole('button', {
        name: /Edit details for user Active User/i,
      });
      fireEvent.click(editButton);

      const nameInput = await screen.findByLabelText(/Full Name/i);
      fireEvent.change(nameInput, { target: { value: 'Updated Name' } });

      const saveButton = screen.getByRole('button', { name: /Save Changes/i });
      fireEvent.click(saveButton);

      // Verify PESSIMISTIC: In-flight state disables button
      expect(screen.getByRole('button', { name: /Saving.../i })).toBeDisabled();

      // Settle server response
      const updatedUser: ManagedUser = {
        ...mockActiveUser,
        name: 'Updated Name',
      };

      act(() => {
        resolveApi(updatedUser);
      });

      // Verify modal closes and notification fired
      await waitFor(() => {
        expect(screen.queryByRole('heading', { name: /Edit User/i })).not.toBeInTheDocument();
      });
      expect(notifySuccessSpy).toHaveBeenCalledWith(
        'User Updated',
        expect.stringContaining('updated successfully'),
        undefined,
      );
    });
  });

  describe('5. Authorization Enforcement', () => {
    it('hides all mutation action triggers when user lacks manage:users permission', async () => {
      renderWithProviders([mockActiveUser, mockInactiveUser], MOCK_MEMBER_USER);

      await waitFor(() => {
        expect(screen.getByText('Active User')).toBeInTheDocument();
      });

      // Add User button must NOT be present
      expect(
        screen.queryByRole('button', { name: /Create new user account/i }),
      ).not.toBeInTheDocument();

      // Quick action buttons must NOT be present
      expect(
        screen.queryByRole('button', { name: /Activate user account/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /Deactivate user account/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /Edit details for user/i }),
      ).not.toBeInTheDocument();
    });
  });
});
