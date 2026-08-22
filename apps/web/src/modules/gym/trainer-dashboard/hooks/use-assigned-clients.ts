import { useQuery } from '@tanstack/react-query';
import { trainerDashboardApi } from '../api/trainer-dashboard-api';
import { trainerDashboardQueryKeys } from '../api/trainer-dashboard-query-keys';
import { AssignedClientMembershipVM, AssignedClientsFilterParams } from '../types';

/**
 * Hook to retrieve all active/frozen/pending client memberships assigned to the trainer.
 */
export function useAssignedClients(params: AssignedClientsFilterParams) {
  return useQuery<AssignedClientMembershipVM[], Error>({
    queryKey: trainerDashboardQueryKeys.assignedClients(params),
    queryFn: () => trainerDashboardApi.getAssignedClients(params),
    enabled: Boolean(params.trainerId && params.trainerId.trim().length > 0),
    staleTime: 30000, // 30s fresh
  });
}
