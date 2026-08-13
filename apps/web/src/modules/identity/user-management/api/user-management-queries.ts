import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNotification } from '../../../../app/providers/notification-provider';
import type {
  CreateUserDTO,
  ManagedUser,
  PaginatedUsersResponse,
  UpdateUserDTO,
  UserListParams,
} from '../domain/user.types';
import {
  activateUser,
  createUser,
  deactivateUser,
  fetchUserById,
  fetchUsers,
  updateUser,
} from './user-management-api';

/**
 * Stable Query Key Factory for User Management
 */
export const userManagementKeys = {
  all: ['user-management'] as const,
  lists: () => [...userManagementKeys.all, 'list'] as const,
  list: (params?: UserListParams) => [...userManagementKeys.lists(), params ?? {}] as const,
  details: () => [...userManagementKeys.all, 'detail'] as const,
  detail: (id: string) => [...userManagementKeys.details(), id] as const,
};

/**
 * Custom Query Hook: Fetch Paginated & Filtered User List
 */
export function useUsersQuery(params?: UserListParams) {
  return useQuery({
    queryKey: userManagementKeys.list(params),
    queryFn: () => fetchUsers(params),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Custom Query Hook: Fetch Single User Details by ID
 */
export function useUserQuery(userId?: string) {
  return useQuery({
    queryKey: userManagementKeys.detail(userId ?? ''),
    queryFn: () => fetchUserById(userId!),
    enabled: Boolean(userId),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Custom Mutation Hook: Create User
 */
export function useCreateUserMutation() {
  const queryClient = useQueryClient();
  const { success, error: notifyError } = useNotification();

  return useMutation({
    mutationFn: (dto: CreateUserDTO) => createUser(dto),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: userManagementKeys.all });
      success('User Created', 'New user account has been created successfully.');
    },
    onError: (err: Error) => {
      notifyError(err, 'Unable to create user account.');
    },
  });
}

/**
 * Custom Mutation Hook: Update User Details
 */
export function useUpdateUserMutation() {
  const queryClient = useQueryClient();
  const { success, error: notifyError } = useNotification();

  return useMutation({
    mutationFn: ({ userId, dto }: { userId: string; dto: UpdateUserDTO }) =>
      updateUser(userId, dto),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: userManagementKeys.all });
      success('User Updated', 'User details updated successfully.');
    },
    onError: (err: Error) => {
      notifyError(err, 'Unable to update user details.');
    },
  });
}

/**
 * Custom Mutation Hook: Activate User with Optimistic Cache Update
 */
export function useActivateUserMutation() {
  const queryClient = useQueryClient();
  const { success, error: notifyError } = useNotification();

  return useMutation({
    mutationFn: (userId: string) => activateUser(userId),
    onMutate: async (userId: string) => {
      await queryClient.cancelQueries({ queryKey: userManagementKeys.all });

      // Snapshot previous query data across lists and details for rollback
      const previousListQueries = queryClient.getQueriesData<PaginatedUsersResponse>({
        queryKey: userManagementKeys.lists(),
      });
      const previousUserDetail = queryClient.getQueryData<ManagedUser>(
        userManagementKeys.detail(userId),
      );

      // Optimistically update status to ACTIVE across active list queries
      queryClient.setQueriesData<PaginatedUsersResponse>(
        { queryKey: userManagementKeys.lists() },
        (oldData) => {
          if (!oldData) return oldData;
          return {
            ...oldData,
            items: oldData.items.map((user) =>
              user.id === userId ? { ...user, status: 'ACTIVE' } : user,
            ),
          };
        },
      );

      // Optimistically update status to ACTIVE in detail cache
      if (previousUserDetail) {
        queryClient.setQueryData<ManagedUser>(userManagementKeys.detail(userId), {
          ...previousUserDetail,
          status: 'ACTIVE',
        });
      }

      return { previousListQueries, previousUserDetail };
    },
    onError: (err: Error, userId: string, context) => {
      // Rollback list queries to previous snapshot
      if (context?.previousListQueries) {
        context.previousListQueries.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      // Rollback detail query to previous snapshot
      if (context?.previousUserDetail) {
        queryClient.setQueryData(userManagementKeys.detail(userId), context.previousUserDetail);
      }

      notifyError(err, 'Failed to activate user account.');
    },
    onSuccess: () => {
      success('User Activated', 'User account has been activated.');
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: userManagementKeys.all });
    },
  });
}

/**
 * Custom Mutation Hook: Deactivate User with Optimistic Cache Update
 */
export function useDeactivateUserMutation() {
  const queryClient = useQueryClient();
  const { success, error: notifyError } = useNotification();

  return useMutation({
    mutationFn: (userId: string) => deactivateUser(userId),
    onMutate: async (userId: string) => {
      await queryClient.cancelQueries({ queryKey: userManagementKeys.all });

      // Snapshot previous query data across lists and details for rollback
      const previousListQueries = queryClient.getQueriesData<PaginatedUsersResponse>({
        queryKey: userManagementKeys.lists(),
      });
      const previousUserDetail = queryClient.getQueryData<ManagedUser>(
        userManagementKeys.detail(userId),
      );

      // Optimistically update status to INACTIVE across active list queries
      queryClient.setQueriesData<PaginatedUsersResponse>(
        { queryKey: userManagementKeys.lists() },
        (oldData) => {
          if (!oldData) return oldData;
          return {
            ...oldData,
            items: oldData.items.map((user) =>
              user.id === userId ? { ...user, status: 'INACTIVE' } : user,
            ),
          };
        },
      );

      // Optimistically update status to INACTIVE in detail cache
      if (previousUserDetail) {
        queryClient.setQueryData<ManagedUser>(userManagementKeys.detail(userId), {
          ...previousUserDetail,
          status: 'INACTIVE',
        });
      }

      return { previousListQueries, previousUserDetail };
    },
    onError: (err: Error, userId: string, context) => {
      // Rollback list queries to previous snapshot
      if (context?.previousListQueries) {
        context.previousListQueries.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      // Rollback detail query to previous snapshot
      if (context?.previousUserDetail) {
        queryClient.setQueryData(userManagementKeys.detail(userId), context.previousUserDetail);
      }

      notifyError(err, 'Failed to deactivate user account.');
    },
    onSuccess: () => {
      success('User Deactivated', 'User account has been deactivated.');
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: userManagementKeys.all });
    },
  });
}
