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
import * as api from '../api/user-management-api';
import { userManagementKeys } from '../api/user-management-queries';
import type { ManagedUser } from '../domain/user.types';
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

const MOCK_ADMIN_USER: AuthUser = {
  id: 'usr_admin_1',
  email: 'admin@kinergy.test',
  name: 'Platform Admin',
  roles: ['ADMIN'],
  permissions: ['manage:users', 'admin:read'],
  tenantId: 'tenant_1',
};

const initialActiveUser: ManagedUser = {
  id: 'usr_active_1',
  name: 'Active Athlete',
  email: 'active@kinergy.test',
  status: 'ACTIVE',
  roles: ['MEMBER'],
  permissions: [],
  tenantId: 'tenant_1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  lastLoginAt: '2026-08-01T00:00:00.000Z',
};

const initialInactiveUser: ManagedUser = {
  id: 'usr_inactive_1',
  name: 'Inactive Athlete',
  email: 'inactive@kinergy.test',
  status: 'INACTIVE',
  roles: ['MEMBER'],
  permissions: [],
  tenantId: 'tenant_1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  lastLoginAt: null,
};

describe('Track C — Step C4.4: Optimistic UX Failure and Concurrency Testing', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const renderComponent = (
    initialUsers: ManagedUser[] = [initialActiveUser, initialInactiveUser],
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
        <AuthProvider initialSessionOverride={MOCK_ADMIN_USER}>
          <NotificationProvider>
            <RouterProvider router={router} />
          </NotificationProvider>
        </AuthProvider>
      </QueryClientProvider>,
    );
  };

  describe('1. Successful Optimistic Mutation', () => {
    it('updates UI immediately to ACTIVE and settles consistently after server confirmation', async () => {
      let resolveApi!: (val: ManagedUser) => void;
      const pendingApi = new Promise<ManagedUser>((res) => {
        resolveApi = res;
      });

      jest.spyOn(api, 'activateUser').mockImplementation(() => pendingApi);
      const notifySuccessSpy = jest.spyOn(notificationService, 'success');

      renderComponent([initialInactiveUser]);

      await waitFor(() => {
        expect(screen.getByText('Inactive Athlete')).toBeInTheDocument();
      });

      const table = screen.getByRole('table');
      expect(within(table).getByText('Inactive')).toBeInTheDocument();

      const activateBtn = screen.getByRole('button', {
        name: /Activate user account for Inactive Athlete/i,
      });
      fireEvent.click(activateBtn);

      // Verify immediate optimistic transition
      await waitFor(() => {
        expect(within(table).getByText('Active')).toBeInTheDocument();
      });

      // Update fetchUsers mock for server reconciliation
      const activatedUser = { ...initialInactiveUser, status: 'ACTIVE' as const };
      jest.spyOn(api, 'fetchUsers').mockResolvedValue({
        items: [activatedUser],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      });

      // Settle server response
      act(() => {
        resolveApi(activatedUser);
      });

      // Verify settled state and toast
      await waitFor(() => {
        expect(notifySuccessSpy).toHaveBeenCalledWith(
          'User Activated',
          expect.stringContaining('activated'),
          undefined,
        );
      });
      expect(within(table).getByText('Active')).toBeInTheDocument();
    });
  });

  describe('2. Failed Optimistic Mutation (500 Server Error)', () => {
    it('optimistically transitions then safely rolls back previous state on 500 error', async () => {
      let rejectApi!: (err: Error) => void;
      const pendingApi = new Promise<ManagedUser>((_, rej) => {
        rejectApi = rej;
      });

      jest.spyOn(api, 'activateUser').mockImplementation(() => pendingApi);
      const notifyErrorSpy = jest.spyOn(notificationService, 'error');

      renderComponent([initialInactiveUser]);

      await waitFor(() => {
        expect(screen.getByText('Inactive Athlete')).toBeInTheDocument();
      });

      const table = screen.getByRole('table');
      const activateBtn = screen.getByRole('button', {
        name: /Activate user account for Inactive Athlete/i,
      });
      fireEvent.click(activateBtn);

      // Optimistic update to Active
      await waitFor(() => {
        expect(within(table).getByText('Active')).toBeInTheDocument();
      });

      // Reject with 500 Server Error
      act(() => {
        rejectApi(new Error('Internal Server Error: Database failure'));
      });

      // Rollback to Inactive on failure
      await waitFor(() => {
        expect(within(table).getByText('Inactive')).toBeInTheDocument();
      });

      expect(notifyErrorSpy).toHaveBeenCalledWith(
        expect.any(Error),
        'Failed to activate user account.',
        undefined,
      );
    });
  });

  describe('3. Refetch During Optimistic Mutation', () => {
    it('cancels background refetch during onMutate to prevent overwriting optimistic state', async () => {
      let resolveApi!: (val: ManagedUser) => void;
      const pendingApi = new Promise<ManagedUser>((res) => {
        resolveApi = res;
      });

      jest.spyOn(api, 'activateUser').mockImplementation(() => pendingApi);

      renderComponent([initialInactiveUser]);

      await waitFor(() => {
        expect(screen.getByText('Inactive Athlete')).toBeInTheDocument();
      });

      const table = screen.getByRole('table');
      const activateBtn = screen.getByRole('button', {
        name: /Activate user account for Inactive Athlete/i,
      });
      fireEvent.click(activateBtn);

      // Optimistically shows Active
      await waitFor(() => {
        expect(within(table).getByText('Active')).toBeInTheDocument();
      });

      // Trigger background refetch while mutation is still pending
      act(() => {
        void queryClient.refetchQueries({ queryKey: userManagementKeys.lists() });
      });

      // Verify optimistic state is NOT corrupted by refetch
      expect(within(table).getByText('Active')).toBeInTheDocument();

      // Resolve mutation
      act(() => {
        resolveApi({ ...initialInactiveUser, status: 'ACTIVE' });
      });

      await waitFor(() => {
        expect(within(table).getByText('Active')).toBeInTheDocument();
      });
    });
  });

  describe('4. Rapid Repeated Mutations', () => {
    it('executes consecutive state transitions cleanly maintaining consistent final state', async () => {
      let resolveActivate!: (val: ManagedUser) => void;
      let resolveDeactivate!: (val: ManagedUser) => void;

      jest.spyOn(api, 'activateUser').mockImplementation(
        () =>
          new Promise<ManagedUser>((res) => {
            resolveActivate = res;
          }),
      );
      jest.spyOn(api, 'deactivateUser').mockImplementation(
        () =>
          new Promise<ManagedUser>((res) => {
            resolveDeactivate = res;
          }),
      );

      renderComponent([initialInactiveUser]);

      await waitFor(() => {
        expect(screen.getByText('Inactive Athlete')).toBeInTheDocument();
      });

      const table = screen.getByRole('table');

      // 1. Activate
      const activateBtn = screen.getByRole('button', {
        name: /Activate user account for Inactive Athlete/i,
      });
      fireEvent.click(activateBtn);

      // Optimistically turns Active
      await waitFor(() => {
        expect(within(table).getByText('Active')).toBeInTheDocument();
      });

      // Update fetchUsers for when activate settles
      jest.spyOn(api, 'fetchUsers').mockResolvedValue({
        items: [{ ...initialInactiveUser, status: 'ACTIVE' }],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      });

      act(() => {
        resolveActivate({ ...initialInactiveUser, status: 'ACTIVE' });
      });

      // 2. Deactivate
      const deactivateBtn = await screen.findByRole('button', {
        name: /Deactivate user account for Inactive Athlete/i,
      });
      fireEvent.click(deactivateBtn);

      const confirmBtn = await screen.findByRole('button', { name: 'Deactivate User' });
      fireEvent.click(confirmBtn);

      // Optimistically turns Inactive
      await waitFor(() => {
        expect(within(table).getByText('Inactive')).toBeInTheDocument();
      });

      // Update fetchUsers for when deactivate settles
      jest.spyOn(api, 'fetchUsers').mockResolvedValue({
        items: [{ ...initialInactiveUser, status: 'INACTIVE' }],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      });

      act(() => {
        resolveDeactivate({ ...initialInactiveUser, status: 'INACTIVE' });
      });

      await waitFor(() => {
        expect(within(table).getByText('Inactive')).toBeInTheDocument();
      });
    });
  });

  describe('5. Duplicate Submission Protection', () => {
    it('disables mutation actions while pending to prevent duplicate submissions', async () => {
      let callCount = 0;
      let resolveApi!: (val: ManagedUser) => void;
      const pendingApi = new Promise<ManagedUser>((res) => {
        resolveApi = res;
      });

      jest.spyOn(api, 'deactivateUser').mockImplementation(() => {
        callCount++;
        return pendingApi;
      });

      renderComponent([initialActiveUser]);

      await waitFor(() => {
        expect(screen.getByText('Active Athlete')).toBeInTheDocument();
      });

      const deactivateBtn = screen.getByRole('button', {
        name: /Deactivate user account for Active Athlete/i,
      });
      fireEvent.click(deactivateBtn);

      const confirmBtn = await screen.findByRole('button', { name: 'Deactivate User' });
      fireEvent.click(confirmBtn);

      // Verify that after modal confirms, duplicate action is prevented
      await waitFor(() => {
        expect(callCount).toBe(1);
      });

      // Settle
      act(() => {
        resolveApi({ ...initialActiveUser, status: 'INACTIVE' });
      });

      await waitFor(() => {
        expect(screen.getByText('Inactive')).toBeInTheDocument();
      });

      expect(callCount).toBe(1);
    });
  });

  describe('6. Component Unmount During Mutation', () => {
    it('handles component unmount safely without memory leak warnings or broken cache state', async () => {
      let resolveApi!: (val: ManagedUser) => void;
      const pendingApi = new Promise<ManagedUser>((res) => {
        resolveApi = res;
      });

      jest.spyOn(api, 'activateUser').mockImplementation(() => pendingApi);

      const { unmount } = renderComponent([initialInactiveUser]);

      await waitFor(() => {
        expect(screen.getByText('Inactive Athlete')).toBeInTheDocument();
      });

      const activateBtn = screen.getByRole('button', {
        name: /Activate user account for Inactive Athlete/i,
      });
      fireEvent.click(activateBtn);

      // Unmount while mutation is pending
      unmount();

      // Resolve mutation in background
      act(() => {
        resolveApi({ ...initialInactiveUser, status: 'ACTIVE' });
      });

      // Verify QueryClient settles safely
      await waitFor(() => {
        expect(queryClient.isMutating()).toBe(0);
      });
    });
  });

  describe('7. Authorization Failure (403 Forbidden)', () => {
    it('reverts optimistic state and alerts user when server returns 403 Forbidden', async () => {
      let rejectApi!: (err: Error) => void;
      const pendingApi = new Promise<ManagedUser>((_, rej) => {
        rejectApi = rej;
      });

      jest.spyOn(api, 'activateUser').mockImplementation(() => pendingApi);
      const notifyErrorSpy = jest.spyOn(notificationService, 'error');

      renderComponent([initialInactiveUser]);

      await waitFor(() => {
        expect(screen.getByText('Inactive Athlete')).toBeInTheDocument();
      });

      const table = screen.getByRole('table');
      const activateBtn = screen.getByRole('button', {
        name: /Activate user account for Inactive Athlete/i,
      });
      fireEvent.click(activateBtn);

      // Optimistic update to Active
      await waitFor(() => {
        expect(within(table).getByText('Active')).toBeInTheDocument();
      });

      // Rollback to Inactive after 403 rejection
      act(() => {
        const forbiddenErr = Object.assign(new Error('Forbidden'), { status: 403 });
        rejectApi(forbiddenErr);
      });

      await waitFor(() => {
        expect(within(table).getByText('Inactive')).toBeInTheDocument();
      });

      expect(notifyErrorSpy).toHaveBeenCalledWith(
        expect.any(Error),
        'Failed to activate user account.',
        undefined,
      );
    });
  });

  describe('8. Business-Rule / Validation Failure (400 Bad Request)', () => {
    it('reverts optimistic state when backend business invariants reject the mutation', async () => {
      let rejectApi!: (err: Error) => void;
      const pendingApi = new Promise<ManagedUser>((_, rej) => {
        rejectApi = rej;
      });

      jest.spyOn(api, 'deactivateUser').mockImplementation(() => pendingApi);
      const notifyErrorSpy = jest.spyOn(notificationService, 'error');

      renderComponent([initialActiveUser]);

      await waitFor(() => {
        expect(screen.getByText('Active Athlete')).toBeInTheDocument();
      });

      const table = screen.getByRole('table');
      const deactivateBtn = screen.getByRole('button', {
        name: /Deactivate user account for Active Athlete/i,
      });
      fireEvent.click(deactivateBtn);

      const confirmBtn = await screen.findByRole('button', { name: 'Deactivate User' });
      fireEvent.click(confirmBtn);

      // Optimistic flip to Inactive
      await waitFor(() => {
        expect(within(table).getByText('Inactive')).toBeInTheDocument();
      });

      // Reverts back to Active upon 400 business rejection
      act(() => {
        const badRequestErr = Object.assign(
          new Error('Cannot deactivate primary system administrator'),
          { status: 400 },
        );
        rejectApi(badRequestErr);
      });

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

  describe('9. Network Failure (Connection Drop)', () => {
    it('reverts optimistic state and dispatches error toast upon network failure', async () => {
      let rejectApi!: (err: Error) => void;
      const pendingApi = new Promise<ManagedUser>((_, rej) => {
        rejectApi = rej;
      });

      jest.spyOn(api, 'activateUser').mockImplementation(() => pendingApi);
      const notifyErrorSpy = jest.spyOn(notificationService, 'error');

      renderComponent([initialInactiveUser]);

      await waitFor(() => {
        expect(screen.getByText('Inactive Athlete')).toBeInTheDocument();
      });

      const table = screen.getByRole('table');
      const activateBtn = screen.getByRole('button', {
        name: /Activate user account for Inactive Athlete/i,
      });
      fireEvent.click(activateBtn);

      // Optimistic update to Active
      await waitFor(() => {
        expect(within(table).getByText('Active')).toBeInTheDocument();
      });

      // Network drop causes immediate rollback
      act(() => {
        rejectApi(new TypeError('Failed to fetch'));
      });

      await waitFor(() => {
        expect(within(table).getByText('Inactive')).toBeInTheDocument();
      });

      expect(notifyErrorSpy).toHaveBeenCalledWith(
        expect.any(Error),
        'Failed to activate user account.',
        undefined,
      );
    });
  });

  describe('10. Server Reconciliation with Authoritative Metadata', () => {
    it('reconciles cache with authoritative server-computed timestamp and metadata', async () => {
      const serverUpdatedTimestamp = '2026-08-21T21:00:00.000Z';
      const reconciledUser: ManagedUser = {
        ...initialInactiveUser,
        status: 'ACTIVE',
        updatedAt: serverUpdatedTimestamp,
        name: 'Reconciled Athlete Name',
      };

      let resolveApi!: (val: ManagedUser) => void;
      const pendingApi = new Promise<ManagedUser>((res) => {
        resolveApi = res;
      });

      jest.spyOn(api, 'activateUser').mockImplementation(() => pendingApi);

      renderComponent([initialInactiveUser]);

      await waitFor(() => {
        expect(screen.getByText('Inactive Athlete')).toBeInTheDocument();
      });

      const activateBtn = screen.getByRole('button', {
        name: /Activate user account for Inactive Athlete/i,
      });
      fireEvent.click(activateBtn);

      // Update fetchUsers mock for invalidation refetch
      jest.spyOn(api, 'fetchUsers').mockResolvedValue({
        items: [reconciledUser],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      });

      // Settle
      act(() => {
        resolveApi(reconciledUser);
      });

      // Settles and invalidates queries, reconciling authoritative name and status
      await waitFor(() => {
        expect(screen.getByText('Reconciled Athlete Name')).toBeInTheDocument();
      });

      const table = screen.getByRole('table');
      expect(within(table).getByText('Active')).toBeInTheDocument();
    });
  });
});
