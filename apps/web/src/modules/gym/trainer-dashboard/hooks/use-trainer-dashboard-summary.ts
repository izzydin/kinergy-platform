import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { trainerDashboardApi } from '../api/trainer-dashboard-api';
import { trainerDashboardQueryKeys } from '../api/trainer-dashboard-query-keys';
import { TrainerDashboardSummaryVM, TrainerSummaryFilterParams } from '../types';

/**
 * Hook to retrieve authoritative operational summary KPIs for the Trainer Dashboard.
 */
export function useTrainerDashboardSummary(
  params?: TrainerSummaryFilterParams,
): UseQueryResult<TrainerDashboardSummaryVM, Error> {
  return useQuery({
    queryKey: trainerDashboardQueryKeys.summary(params),
    queryFn: () => trainerDashboardApi.getSummary(params),
    staleTime: 60 * 1000,
    retry: 2,
  });
}
