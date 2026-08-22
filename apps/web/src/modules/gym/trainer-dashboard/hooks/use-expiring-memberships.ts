import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { trainerDashboardApi } from '../api/trainer-dashboard-api';
import { trainerDashboardQueryKeys } from '../api/trainer-dashboard-query-keys';
import { ExpiringMembershipItemVM, ExpiringMembershipsFilterParams } from '../types';

/**
 * Hook to retrieve memberships expiring soon within the designated lookahead horizon.
 */
export function useExpiringMemberships(
  params?: ExpiringMembershipsFilterParams,
): UseQueryResult<
  { items: ExpiringMembershipItemVM[]; total: number; horizonDays: number },
  Error
> {
  return useQuery({
    queryKey: trainerDashboardQueryKeys.expiringMemberships(params),
    queryFn: () => trainerDashboardApi.getExpiringMemberships(params),
    staleTime: 60 * 1000,
    retry: 2,
  });
}
