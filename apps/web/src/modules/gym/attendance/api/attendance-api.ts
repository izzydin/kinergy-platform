import { httpClient } from '../../../../shared/api/http-client';
import {
  AttendanceRangeSummaryVM,
  AttendanceSummaryFilterParams,
  ClientSearchResultDTO,
  MembershipEligibilityDTO,
  PaginatedAttendanceVM,
  RecordCheckInInputVM,
  RecordCheckInResponseVM,
  TodayAttendanceFilterParams,
} from '../types';

export const attendanceApi = {
  /**
   * Searches clients by name, email, or client ID for rapid check-in selection.
   */
  async searchClients(
    query: string,
    options?: { signal?: AbortSignal },
  ): Promise<ClientSearchResultDTO[]> {
    if (!query || query.trim().length === 0) {
      return [];
    }
    return httpClient.get<ClientSearchResultDTO[]>('/api/v1/clients/search', {
      params: { q: query.trim() },
      signal: options?.signal,
    });
  },

  /**
   * Evaluates authoritative Membership eligibility for a client right now.
   */
  async checkEligibility(
    clientId: string,
    asOf?: string,
    options?: { signal?: AbortSignal },
  ): Promise<MembershipEligibilityDTO> {
    return httpClient.get<MembershipEligibilityDTO>('/api/v1/gym/memberships/eligibility/check', {
      params: { clientId, asOf },
      signal: options?.signal,
    });
  },

  /**
   * Records and evaluates physical check-in entry attempt.
   */
  async recordCheckIn(
    input: RecordCheckInInputVM,
    options?: { signal?: AbortSignal },
  ): Promise<RecordCheckInResponseVM> {
    return httpClient.post<RecordCheckInResponseVM>(
      '/api/v1/gym/attendance/check-in',
      input,
      options,
    );
  },

  /**
   * Retrieves today's operational check-in feed and summary KPIs for the active facility.
   */
  async getToday(
    params?: TodayAttendanceFilterParams,
    options?: { signal?: AbortSignal },
  ): Promise<PaginatedAttendanceVM> {
    return httpClient.get<PaginatedAttendanceVM>('/api/v1/gym/attendance/today', {
      params: params as Record<string, string | number | boolean | null | undefined>,
      signal: options?.signal,
    });
  },

  /**
   * Retrieves aggregate attendance KPIs and hourly traffic distribution across date range.
   */
  async getSummary(
    params: AttendanceSummaryFilterParams,
    options?: { signal?: AbortSignal },
  ): Promise<AttendanceRangeSummaryVM> {
    return httpClient.get<AttendanceRangeSummaryVM>('/api/v1/gym/attendance/summary', {
      params: params as unknown as Record<string, string | number | boolean | null | undefined>,
      signal: options?.signal,
    });
  },

  /**
   * Retrieves chronological attendance history and visit stats for a client.
   */
  async getClientHistory(
    clientId: string,
    params?: { dateFrom?: string; dateTo?: string; page?: number; limit?: number },
    options?: { signal?: AbortSignal },
  ): Promise<PaginatedAttendanceVM> {
    return httpClient.get<PaginatedAttendanceVM>(
      `/api/v1/gym/attendance/client/${encodeURIComponent(clientId)}`,
      {
        params: params as Record<string, string | number | boolean | null | undefined>,
        signal: options?.signal,
      },
    );
  },

  /**
   * Multi-criteria paginated search across attendance logs.
   */
  async searchAttendance(
    params?: {
      clientId?: string;
      gymDay?: string;
      dateFrom?: string;
      dateTo?: string;
      facilityId?: string;
      result?: string;
      method?: string;
      page?: number;
      limit?: number;
    },
    options?: { signal?: AbortSignal },
  ): Promise<PaginatedAttendanceVM> {
    return httpClient.get<PaginatedAttendanceVM>('/api/v1/gym/attendance/search', {
      params: params as Record<string, string | number | boolean | null | undefined>,
      signal: options?.signal,
    });
  },
};
