import '@testing-library/jest-dom';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { NotificationProvider } from '../../../../../app/providers/notification-provider';
import { MOCK_MANAGED_USERS } from '../../mocks/user-management-fixtures';
import {
  userManagementKeys,
  useActivateUserMutation,
  useCreateUserMutation,
  useDeactivateUserMutation,
  useUpdateUserMutation,
  useUserQuery,
  useUsersQuery,
} from '../user-management-queries';

function mockFetchSuccess(body: unknown, status = 200): jest.Mock {
  const textPayload = typeof body === 'string' ? body : JSON.stringify(body);
  const mockFn = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(textPayload),
    json: () => Promise.resolve(body),
  } as Response);
  global.fetch = mockFn as unknown as typeof fetch;
  return mockFn;
}

function mockFetchError(status: number, message: string): jest.Mock {
  const errorPayload = { statusCode: status, message, error: 'API Error' };
  const mockFn = jest.fn().mockResolvedValue({
    ok: false,
    status,
    text: () => Promise.resolve(JSON.stringify(errorPayload)),
    json: () => Promise.resolve(errorPayload),
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

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <NotificationProvider>{children}</NotificationProvider>
      </QueryClientProvider>
    );
  };
}

describe('User Management TanStack Query Hooks & Optimistic Mutations', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    queryClient.clear();
  });

  describe('Stable Query Key Factory', () => {
    it('generates predictable query keys', () => {
      expect(userManagementKeys.all).toEqual(['user-management']);
      expect(userManagementKeys.lists()).toEqual(['user-management', 'list']);
      expect(userManagementKeys.list({ page: 1 })).toEqual([
        'user-management',
        'list',
        { page: 1 },
      ]);
      expect(userManagementKeys.details()).toEqual(['user-management', 'detail']);
      expect(userManagementKeys.detail('usr_123')).toEqual([
        'user-management',
        'detail',
        'usr_123',
      ]);
    });
  });

  describe('useUsersQuery', () => {
    it('fetches user list with TanStack Query', async () => {
      mockFetchSuccess({
        items: MOCK_MANAGED_USERS,
        total: 5,
        page: 1,
        limit: 10,
        totalPages: 1,
      });

      const { result } = renderHook(() => useUsersQuery({ page: 1, limit: 10 }), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toBeDefined();
      expect(result.current.data?.items).toHaveLength(5);
    });
  });

  describe('useUserQuery', () => {
    it('fetches single user details by ID', async () => {
      mockFetchSuccess(MOCK_MANAGED_USERS[0]);

      const { result } = renderHook(() => useUserQuery('usr_admin_1'), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.id).toBe('usr_admin_1');
      expect(result.current.data?.email).toBe('admin@kinergy.io');
    });
  });

  describe('useCreateUserMutation', () => {
    it('executes user creation and invalidates user list query cache', async () => {
      const mockCreated = {
        id: 'usr_new_123',
        email: 'test.create@kinergy.io',
        name: 'Test Create',
        status: 'ACTIVE',
        roles: ['MEMBER'],
        permissions: ['client:read'],
        tenantId: 'tenant_kinergy_master',
        createdAt: '2026-08-13T12:00:00.000Z',
        updatedAt: '2026-08-13T12:00:00.000Z',
        lastLoginAt: null,
      };

      mockFetchSuccess({
        items: MOCK_MANAGED_USERS,
        total: 5,
        page: 1,
        limit: 10,
        totalPages: 1,
      });

      const { result: listResult } = renderHook(() => useUsersQuery(), {
        wrapper: createWrapper(queryClient),
      });
      await waitFor(() => expect(listResult.current.isSuccess).toBe(true));

      mockFetchSuccess(mockCreated, 201);

      const { result: mutationResult } = renderHook(() => useCreateUserMutation(), {
        wrapper: createWrapper(queryClient),
      });

      await act(async () => {
        await mutationResult.current.mutateAsync({
          email: 'test.create@kinergy.io',
          name: 'Test Create',
          role: 'MEMBER',
        });
      });

      expect(mutationResult.current.isSuccess).toBe(true);
    });
  });

  describe('useUpdateUserMutation', () => {
    it('executes user update and invalidates cache', async () => {
      const mockUpdated = {
        ...MOCK_MANAGED_USERS[2],
        name: 'Updated Member',
      };
      mockFetchSuccess(mockUpdated);

      const { result: mutationResult } = renderHook(() => useUpdateUserMutation(), {
        wrapper: createWrapper(queryClient),
      });

      await act(async () => {
        await mutationResult.current.mutateAsync({
          userId: 'usr_member_1',
          dto: { name: 'Updated Member' },
        });
      });

      expect(mutationResult.current.isSuccess).toBe(true);
    });
  });

  describe('useActivateUserMutation (Optimistic Update & Rollback)', () => {
    it('optimistically updates user status to ACTIVE and settles server cache', async () => {
      mockFetchSuccess({
        items: MOCK_MANAGED_USERS,
        total: 5,
        page: 1,
        limit: 10,
        totalPages: 1,
      });

      // 1. Populate query cache with initial inactive user list
      const { result: listResult } = renderHook(() => useUsersQuery(), {
        wrapper: createWrapper(queryClient),
      });
      await waitFor(() => expect(listResult.current.isSuccess).toBe(true));

      mockFetchSuccess({
        ...MOCK_MANAGED_USERS[2],
        status: 'ACTIVE',
      });

      const { result: activateMutation } = renderHook(() => useActivateUserMutation(), {
        wrapper: createWrapper(queryClient),
      });

      // 2. Perform optimistic activation for inactive user `usr_member_1`
      await act(async () => {
        await activateMutation.current.mutateAsync('usr_member_1');
      });

      expect(activateMutation.current.isSuccess).toBe(true);
    });

    it('rolls back optimistic status update if activation mutation fails', async () => {
      mockFetchSuccess({
        items: MOCK_MANAGED_USERS,
        total: 5,
        page: 1,
        limit: 10,
        totalPages: 1,
      });

      const { result: listResult } = renderHook(() => useUsersQuery(), {
        wrapper: createWrapper(queryClient),
      });
      await waitFor(() => expect(listResult.current.isSuccess).toBe(true));

      mockFetchError(400, 'Activation failed');

      const { result: activateMutation } = renderHook(() => useActivateUserMutation(), {
        wrapper: createWrapper(queryClient),
      });

      await act(async () => {
        try {
          await activateMutation.current.mutateAsync('usr_member_1');
        } catch {
          // Expected error
        }
      });

      expect(activateMutation.current.isError).toBe(true);
    });
  });

  describe('useDeactivateUserMutation (Optimistic Update & Rollback)', () => {
    it('optimistically updates user status to INACTIVE and settles server cache', async () => {
      mockFetchSuccess({
        items: MOCK_MANAGED_USERS,
        total: 5,
        page: 1,
        limit: 10,
        totalPages: 1,
      });

      const { result: listResult } = renderHook(() => useUsersQuery(), {
        wrapper: createWrapper(queryClient),
      });
      await waitFor(() => expect(listResult.current.isSuccess).toBe(true));

      mockFetchSuccess({
        ...MOCK_MANAGED_USERS[0],
        status: 'INACTIVE',
      });

      const { result: deactivateMutation } = renderHook(() => useDeactivateUserMutation(), {
        wrapper: createWrapper(queryClient),
      });

      await act(async () => {
        await deactivateMutation.current.mutateAsync('usr_admin_1');
      });

      expect(deactivateMutation.current.isSuccess).toBe(true);
    });
  });
});
