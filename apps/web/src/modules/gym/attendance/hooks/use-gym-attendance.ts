import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNotification } from '../../../../app/providers/notification-provider';
import { attendanceApi } from '../api/attendance-api';
import { attendanceQueryKeys } from '../api/attendance-query-keys';
import {
  AccessResult,
  ClientSearchResultDTO,
  MembershipEligibilityDTO,
  PaginatedAttendanceVM,
  RecordCheckInInputVM,
  RecordCheckInResponseVM,
  TodayAttendanceFilterParams,
} from '../types';

/**
 * Hook to fetch today's live operational check-in feed and daily summary KPIs.
 */
export function useTodayAttendance(params?: TodayAttendanceFilterParams) {
  return useQuery<PaginatedAttendanceVM, Error>({
    queryKey: attendanceQueryKeys.today(params),
    queryFn: () => attendanceApi.getToday(params),
    staleTime: 15 * 1000,
    refetchInterval: 15 * 1000, // 15s live polling for reception desk
  });
}

/**
 * Hook to evaluate a client's authoritative backend membership eligibility.
 */
export function useClientEligibility(clientId?: string, asOf?: string) {
  return useQuery<MembershipEligibilityDTO, Error>({
    queryKey: attendanceQueryKeys.eligibility(clientId, asOf),
    queryFn: () => {
      if (!clientId) throw new Error('Client ID is required');
      return attendanceApi.checkEligibility(clientId, asOf);
    },
    enabled: Boolean(clientId && clientId.trim().length > 0),
    staleTime: 10 * 1000,
  });
}

/**
 * Hook to search registered clients for rapid check-in selection.
 */
export function useClientSearch(query: string) {
  return useQuery<ClientSearchResultDTO[], Error>({
    queryKey: attendanceQueryKeys.clientSearch(query),
    queryFn: () => attendanceApi.searchClients(query),
    enabled: Boolean(query && query.trim().length >= 2),
    staleTime: 30 * 1000,
  });
}

/**
 * Hook to retrieve chronological attendance history and visit stats for a client.
 */
export function useClientAttendanceHistory(
  clientId: string,
  params?: { dateFrom?: string; dateTo?: string; page?: number; limit?: number },
) {
  return useQuery<PaginatedAttendanceVM, Error>({
    queryKey: attendanceQueryKeys.clientHistory(clientId, params),
    queryFn: () => attendanceApi.getClientHistory(clientId, params),
    enabled: Boolean(clientId && clientId.trim().length > 0),
    staleTime: 30 * 1000,
  });
}

/**
 * Hook for multi-criteria attendance search across logs.
 */
export function useAttendanceSearch(params?: Parameters<typeof attendanceApi.searchAttendance>[0]) {
  return useQuery<PaginatedAttendanceVM, Error>({
    queryKey: attendanceQueryKeys.search(params),
    queryFn: () => attendanceApi.searchAttendance(params),
    staleTime: 30 * 1000,
  });
}

/**
 * Mutation hook to record a gym check-in with automatic scoped cache invalidation
 * and contextual operational notifications.
 */
export function useAttendanceCheckIn() {
  const queryClient = useQueryClient();
  const { success, error, warning } = useNotification();

  return useMutation<RecordCheckInResponseVM, Error, RecordCheckInInputVM>({
    mutationFn: (input: RecordCheckInInputVM) => attendanceApi.recordCheckIn(input),
    onSuccess: (result, input) => {
      if (result.isGranted) {
        if (result.isIdempotentReplay) {
          success(`Check-in replayed successfully (Idempotent: ${result.attendanceId})`);
        } else {
          success(`Check-in granted! Admission recorded for member ${result.clientId}.`);
        }
      } else {
        if (result.outcome === AccessResult.DENIED_DUPLICATE_CHECKIN) {
          warning(
            'Duplicate check-in: Access was already recorded for this member within the last 5 minutes.',
          );
        } else {
          error(
            `Admission Denied (${result.outcome}): ${result.denialReason ?? 'Ineligible membership status.'}`,
          );
        }
      }

      // Scoped cache invalidation
      queryClient.invalidateQueries({ queryKey: attendanceQueryKeys.today() });
      queryClient.invalidateQueries({
        queryKey: attendanceQueryKeys.eligibility(input.clientId),
      });
      queryClient.invalidateQueries({
        queryKey: attendanceQueryKeys.clientHistory(input.clientId),
      });
      queryClient.invalidateQueries({
        queryKey: ['gym', 'memberships'],
      });
      queryClient.invalidateQueries({
        queryKey: ['gym', 'trainer-dashboard'],
      });
    },
    onError: (err) => {
      error(err.message || 'Failed to record check-in. Please verify network connection.');
    },
  });
}
