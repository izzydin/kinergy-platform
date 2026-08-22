export const attendanceQueryKeys = {
  all: ['gym', 'attendance'] as const,
  today: (params?: {
    date?: string;
    facilityId?: string;
    result?: string;
    method?: string;
    page?: number;
    limit?: number;
  }) => [...attendanceQueryKeys.all, 'today', params ?? {}] as const,
  summary: (params?: { startDate?: string; endDate?: string; facilityId?: string }) =>
    [...attendanceQueryKeys.all, 'summary', params ?? {}] as const,
  clientHistory: (
    clientId: string,
    params?: { dateFrom?: string; dateTo?: string; page?: number; limit?: number },
  ) => [...attendanceQueryKeys.all, 'client', clientId, params ?? {}] as const,
  search: (params?: Record<string, unknown>) =>
    [...attendanceQueryKeys.all, 'search', params ?? {}] as const,
};
