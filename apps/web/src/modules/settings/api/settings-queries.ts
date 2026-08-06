import { useQuery } from '@tanstack/react-query';
import { fetchUserProfile } from './settings-api';
import { settingsKeys } from './settings-query-keys';
import type { UserProfileViewModel } from '../../dashboard/types';

/**
 * useUserProfileQuery
 *
 * Fetches the authenticated user's profile from /api/v1/settings/profile.
 * Data is cached for 5 minutes (suitable for a settings page — changes infrequently).
 *
 * Populated by the useUpdateProfileMutation optimistic update on successful mutations.
 */
export function useUserProfileQuery() {
  return useQuery<UserProfileViewModel, Error>({
    queryKey: settingsKeys.profile(),
    queryFn: fetchUserProfile,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}
