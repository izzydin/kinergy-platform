import { useMutation, useQueryClient } from '@tanstack/react-query';
import { changePassword, updateUserProfile } from './settings-api';
import { settingsKeys } from './settings-query-keys';
import type { ChangePasswordInput, UpdateProfileInput } from './settings-api';
import type { UserProfileViewModel } from '../../dashboard/types';

// ─────────────────────────────────────────────────────────────────────────────
// Profile Update Mutation (Deprecated / Capability Gap)
//
// Self-service profile updates are not supported by the backend identity API.
// User identity attributes (email, roles, status) are managed via administrative
// endpoints (PUT /api/v1/users/:id). Any invocation safely rejects.
// ─────────────────────────────────────────────────────────────────────────────

interface ProfileMutationContext {
  previousProfile: UserProfileViewModel | undefined;
}

/**
 * useUpdateProfileMutation
 *
 * Optimistically updates the user profile and rolls back on network failure.
 *
 * Usage:
 * ```tsx
 * const { mutate: updateProfile, isPending } = useUpdateProfileMutation();
 * updateProfile({ displayName: 'New Name', email: 'new@email.com' });
 * ```
 */
export function useUpdateProfileMutation() {
  const queryClient = useQueryClient();
  const profileKey = settingsKeys.profile();

  return useMutation<UserProfileViewModel, Error, UpdateProfileInput, ProfileMutationContext>({
    mutationFn: (data) => updateUserProfile(data),

    onMutate: async (data) => {
      // 1. Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: profileKey });

      // 2. Snapshot
      const previousProfile = queryClient.getQueryData<UserProfileViewModel>(profileKey);

      // 3. Optimistic update
      if (previousProfile) {
        queryClient.setQueryData<UserProfileViewModel>(profileKey, {
          ...previousProfile,
          displayName: data.displayName,
          email: data.email,
        });
      }

      return { previousProfile };
    },

    onError: (_error, _vars, context) => {
      if (context?.previousProfile !== undefined) {
        queryClient.setQueryData<UserProfileViewModel>(profileKey, context.previousProfile);
      }
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: profileKey });
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Password Change Mutation — no optimistic update (passwords are not cached)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * useChangePasswordMutation
 *
 * Sends a password change request to the authoritative identity API:
 * POST /api/v1/auth/change-password
 *
 * Passwords are never stored in the client-side query cache.
 * Non-idempotent operation (retry: false).
 */
export function useChangePasswordMutation() {
  return useMutation<{ success: boolean }, Error, ChangePasswordInput>({
    mutationFn: (data) => changePassword(data),
    // No retry: password changes are non-idempotent operations
    retry: false,
  });
}
