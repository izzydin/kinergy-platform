import { httpClient } from '../../../shared/api/http-client';
import {
  ClientSearchResultDTO,
  MembershipEligibilityDTO,
  PaginatedAttendanceResultDTO,
  RecordCheckInPayload,
  RecordCheckInResultDTO,
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
  async checkEligibility(clientId: string): Promise<MembershipEligibilityDTO> {
    return httpClient.get<MembershipEligibilityDTO>(
      `/api/v1/gym/memberships/eligibility/${encodeURIComponent(clientId)}`,
    );
  },

  /**
   * Submits an ingress check-in request to the backend.
   */
  async recordCheckIn(payload: RecordCheckInPayload): Promise<RecordCheckInResultDTO> {
    return httpClient.post<RecordCheckInResultDTO>('/api/v1/gym/attendance/check-in', payload);
  },

  /**
   * Retrieves today's live attendance feed and daily operational KPIs.
   */
  async getTodayAttendance(
    params?: TodayAttendanceFilterParams,
  ): Promise<PaginatedAttendanceResultDTO> {
    return httpClient.get<PaginatedAttendanceResultDTO>('/api/v1/gym/attendance/today', {
      params: params as Record<string, string | number | boolean | null | undefined>,
    });
  },

  /**
   * Retrieves chronological attendance history for a single client.
   */
  async getClientHistory(
    clientId: string,
    params?: { page?: number; limit?: number },
  ): Promise<PaginatedAttendanceResultDTO> {
    return httpClient.get<PaginatedAttendanceResultDTO>(
      `/api/v1/gym/attendance/clients/${encodeURIComponent(clientId)}/history`,
      {
        params: params as Record<string, string | number | boolean | null | undefined>,
      },
    );
  },
};
