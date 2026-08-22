import { useQuery } from '@tanstack/react-query';
import { trainerDashboardApi } from '../api/trainer-dashboard-api';
import { trainerDashboardQueryKeys } from '../api/trainer-dashboard-query-keys';
import { AssignedClientMembershipVM, ExpiringMembershipsFilterParams } from '../types';

/**
 * Hook to retrieve memberships assigned to the trainer that are expiring soon.
 */
export function useExpiringClients(params: ExpiringMembershipsFilterParams) {
  return useQuery<AssignedClientMembershipVM[], Error>({
    queryKey: trainerDashboardQueryKeys.expiringClients(params),
    queryFn: () => trainerDashboardApi.getExpiringClients(params),
    enabled: Boolean(params.trainerId && params.trainerId.trim().length > 0),
    staleTime: 60000, // 1m fresh
  });
}
