import { httpClient } from '../../../../shared/api/http-client';
import { PaginatedAttendanceVM, RecordCheckInInputVM, RecordCheckInResponseVM } from '../types';

export const attendanceApi = {
  /**
   * Records and evaluates physical check-in entry attempt.
   */
  async recordCheckIn(input: RecordCheckInInputVM): Promise<RecordCheckInResponseVM> {
    return httpClient.post<RecordCheckInResponseVM>('/api/v1/gym/attendance/check-in', input);
  },

  /**
   * Retrieves today's operational check-in feed and summary KPIs for the active facility.
   */
  async getToday(params?: {
    date?: string;
    facilityId?: string;
    result?: string;
    method?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedAttendanceVM> {
    return httpClient.get<PaginatedAttendanceVM>('/api/v1/gym/attendance/today', {
      params,
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
      { params },
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
      params,
    });
  },
};
