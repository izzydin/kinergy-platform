import { useQuery } from '@tanstack/react-query';
import { trainerDashboardApi } from '../api/trainer-dashboard-api';
import { trainerDashboardQueryKeys } from '../api/trainer-dashboard-query-keys';
import { AttendanceItemDTO } from '../types';

/**
 * Hook to retrieve today's attendance entries for assigned clients with near-real-time polling (30s).
 */
export function useTodayAssignedCheckIns(trainerId: string, assignedClientIds: string[]) {
  return useQuery<AttendanceItemDTO[], Error>({
    queryKey: trainerDashboardQueryKeys.todayCheckIns(trainerId, assignedClientIds),
    queryFn: () => trainerDashboardApi.getTodayAssignedCheckIns(assignedClientIds),
    enabled: Boolean(trainerId && assignedClientIds.length > 0),
    refetchInterval: 30000, // 30s background polling
    staleTime: 15000,
  });
}
