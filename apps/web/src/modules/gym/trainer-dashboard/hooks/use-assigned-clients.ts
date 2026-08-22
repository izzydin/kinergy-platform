import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { trainerDashboardApi } from '../api/trainer-dashboard-api';
import { trainerDashboardQueryKeys } from '../api/trainer-dashboard-query-keys';
import { AssignedClientsFilterParams, PaginatedAssignedClientsVM } from '../types';

/**
 * Hook to retrieve paginated and sorted assigned client memberships.
 */
export function useAssignedClients(
  params?: AssignedClientsFilterParams,
): UseQueryResult<PaginatedAssignedClientsVM, Error> {
  return useQuery({
    queryKey: trainerDashboardQueryKeys.assignedClients(params),
    queryFn: () => trainerDashboardApi.getAssignedClients(params),
    staleTime: 30 * 1000,
    retry: 2,
  });
}
