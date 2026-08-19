import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { attendanceApi } from '../api/attendance-api';
import { useNotification } from '../../../app/providers/notification-provider';
import {
  AccessResult,
  ClientSearchResultDTO,
  MembershipEligibilityDTO,
  PaginatedAttendanceResultDTO,
  RecordCheckInPayload,
  RecordCheckInResultDTO,
  TodayAttendanceFilterParams,
} from '../types';

export const attendanceQueryKeys = {
  all: ['attendance'] as const,
  today: (params?: TodayAttendanceFilterParams) => ['attendance', 'today', params] as const,
  eligibility: (clientId?: string) => ['attendance', 'eligibility', clientId] as const,
  clientHistory: (clientId: string, params?: { page?: number; limit?: number }) =>
    ['attendance', 'client-history', clientId, params] as const,
  clientSearch: (query: string) => ['attendance', 'client-search', query] as const,
};

/**
 * Hook to fetch today's live attendance feed and daily summary KPIs.
 */
export function useTodayAttendance(params?: TodayAttendanceFilterParams) {
  return useQuery<PaginatedAttendanceResultDTO, Error>({
    queryKey: attendanceQueryKeys.today(params),
    queryFn: () => attendanceApi.getTodayAttendance(params),
    refetchInterval: 15000, // Automatic 15s polling for reception screen
  });
}

/**
 * Hook to evaluate a member's authoritative backend eligibility.
 */
export function useClientEligibility(clientId?: string) {
  return useQuery<MembershipEligibilityDTO, Error>({
    queryKey: attendanceQueryKeys.eligibility(clientId),
    queryFn: () => {
      if (!clientId) throw new Error('Client ID is required');
      return attendanceApi.checkEligibility(clientId);
    },
    enabled: Boolean(clientId && clientId.trim().length > 0),
    staleTime: 10000, // 10s fresh cache
  });
}

/**
 * Hook to search clients for quick selection.
 */
export function useClientSearch(query: string) {
  return useQuery<ClientSearchResultDTO[], Error>({
    queryKey: attendanceQueryKeys.clientSearch(query),
    queryFn: () => attendanceApi.searchClients(query),
    enabled: Boolean(query && query.trim().length >= 2),
    staleTime: 30000,
  });
}

/**
 * Mutation hook to record gym check-in with automatic cache invalidation and operational feedback.
 */
export function useRecordCheckInMutation() {
  const queryClient = useQueryClient();
  const { success, error, warning } = useNotification();

  return useMutation<RecordCheckInResultDTO, Error, RecordCheckInPayload>({
    mutationFn: (payload) => attendanceApi.recordCheckIn(payload),
    onSuccess: (result, payload) => {
      if (result.isGranted) {
        if (result.isIdempotentReplay) {
          success(`Check-in replayed successfully (Idempotent: ${result.attendanceId})`);
        } else {
          success(`Check-in granted! Admission recorded for client ${result.clientId}.`);
        }
      } else {
        if (result.outcome === AccessResult.DENIED_DUPLICATE_CHECKIN) {
          warning(`Duplicate scan: Check-in was already granted within the last 5 minutes.`);
        } else {
          error(
            `Access Denied (${result.outcome}): ${result.denialReason ?? 'Ineligible membership.'}`,
          );
        }
      }

      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['attendance', 'today'] });
      queryClient.invalidateQueries({
        queryKey: attendanceQueryKeys.eligibility(payload.clientId),
      });
      queryClient.invalidateQueries({
        queryKey: ['attendance', 'client-history', payload.clientId],
      });
    },
    onError: (err) => {
      error(err.message || 'Failed to record check-in. Please check network connection.');
    },
  });
}
