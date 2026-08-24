import { httpClient } from '../../../../shared/api/http-client';
import {
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
  async searchClients(query: string): Promise<ClientSearchResultDTO[]> {
    if (!query || query.trim().length === 0) {
      return [];
    }
    return httpClient.get<ClientSearchResultDTO[]>('/api/v1/clients/search', {
      params: { q: query.trim() },
    });
  },

  /**
   * Evaluates authoritative Membership eligibility for a client right now.
   */
  async checkEligibility(clientId: string, asOf?: string): Promise<MembershipEligibilityDTO> {
    return httpClient.get<MembershipEligibilityDTO>('/api/v1/gym/memberships/eligibility/check', {
      params: { clientId, asOf },
    });
  },

  /**
   * Records and evaluates physical check-in entry attempt.
   */
  async recordCheckIn(input: RecordCheckInInputVM): Promise<RecordCheckInResponseVM> {
    return httpClient.post<RecordCheckInResponseVM>('/api/v1/gym/attendance/check-in', input);
  },

  /**
   * Retrieves today's operational check-in feed and summary KPIs for the active facility.
   */
  async getToday(params?: TodayAttendanceFilterParams): Promise<PaginatedAttendanceVM> {
    return httpClient.get<PaginatedAttendanceVM>('/api/v1/gym/attendance/today', {
      params: params as Record<string, string | number | boolean | null | undefined>,
    });
  },

  /**
   * Retrieves chronological attendance history and visit stats for a client.
   */
  async getClientHistory(
    clientId: string,
    params?: { dateFrom?: string; dateTo?: string; page?: number; limit?: number },
  ): Promise<PaginatedAttendanceVM> {
    return httpClient.get<PaginatedAttendanceVM>(
      `/api/v1/gym/attendance/client/${encodeURIComponent(clientId)}`,
      { params: params as Record<string, string | number | boolean | null | undefined> },
    );
  },

  /**
   * Multi-criteria paginated search across attendance logs.
   */
  async searchAttendance(params?: {
    clientId?: string;
    gymDay?: string;
    dateFrom?: string;
    dateTo?: string;
    facilityId?: string;
    result?: string;
    method?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedAttendanceVM> {
    return httpClient.get<PaginatedAttendanceVM>('/api/v1/gym/attendance/search', {
      params: params as Record<string, string | number | boolean | null | undefined>,
    });
  },
};
