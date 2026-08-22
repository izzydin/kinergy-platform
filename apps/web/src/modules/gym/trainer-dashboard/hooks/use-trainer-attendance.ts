import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { trainerDashboardApi } from '../api/trainer-dashboard-api';
import { trainerDashboardQueryKeys } from '../api/trainer-dashboard-query-keys';
import { TrainerAttendanceFilterParams, TrainerAttendanceResponseVM } from '../types';

/**
 * Hook to retrieve operational attendance check-ins for the trainer's assigned clients.
 */
export function useTrainerAttendance(
  params?: TrainerAttendanceFilterParams,
  options?: { refetchInterval?: number },
): UseQueryResult<TrainerAttendanceResponseVM, Error> {
  return useQuery({
    queryKey: trainerDashboardQueryKeys.attendance(params),
    queryFn: () => trainerDashboardApi.getAttendance(params),
    staleTime: 15 * 1000,
    refetchInterval: options?.refetchInterval ?? 30 * 1000,
    retry: 2,
  });
}
