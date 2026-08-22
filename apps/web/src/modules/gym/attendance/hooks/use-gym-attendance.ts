import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { attendanceApi } from '../api/attendance-api';
import { attendanceQueryKeys } from '../api/attendance-query-keys';
import { RecordCheckInInputVM } from '../types';

export function useTodayAttendance(params?: {
  date?: string;
  facilityId?: string;
  result?: string;
  method?: string;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: attendanceQueryKeys.today(params),
    queryFn: () => attendanceApi.getToday(params),
    staleTime: 15 * 1000,
  });
}

export function useClientAttendanceHistory(
  clientId: string,
  params?: { dateFrom?: string; dateTo?: string; page?: number; limit?: number },
) {
  return useQuery({
    queryKey: attendanceQueryKeys.clientHistory(clientId, params),
    queryFn: () => attendanceApi.getClientHistory(clientId, params),
    enabled: Boolean(clientId && clientId.trim().length > 0),
    staleTime: 30 * 1000,
  });
}

export function useAttendanceSearch(params?: Parameters<typeof attendanceApi.searchAttendance>[0]) {
  return useQuery({
    queryKey: attendanceQueryKeys.search(params),
    queryFn: () => attendanceApi.searchAttendance(params),
    staleTime: 30 * 1000,
  });
}

export function useAttendanceCheckIn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: RecordCheckInInputVM) => attendanceApi.recordCheckIn(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: attendanceQueryKeys.all });
    },
  });
}
