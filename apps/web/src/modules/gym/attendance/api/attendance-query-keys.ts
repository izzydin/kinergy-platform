export const attendanceQueryKeys = {
  all: ['gym', 'attendance'] as const,
  todays: () => [...attendanceQueryKeys.all, 'today'] as const,
  today: (params?: {
    date?: string;
    facilityId?: string;
    result?: string;
    method?: string;
    page?: number;
    limit?: number;
  }) => [...attendanceQueryKeys.all, 'today', params ?? {}] as const,
  summaries: () => [...attendanceQueryKeys.all, 'summary'] as const,
  summary: (params?: { startDate?: string; endDate?: string; facilityId?: string }) =>
    [...attendanceQueryKeys.all, 'summary', params ?? {}] as const,
  clientHistories: (clientId?: string) =>
    clientId
      ? ([...attendanceQueryKeys.all, 'client', clientId] as const)
      : ([...attendanceQueryKeys.all, 'client'] as const),
  clientHistory: (
    clientId: string,
    params?: { dateFrom?: string; dateTo?: string; page?: number; limit?: number },
  ) => [...attendanceQueryKeys.all, 'client', clientId, params ?? {}] as const,
  searches: () => [...attendanceQueryKeys.all, 'search'] as const,
  search: (params?: Record<string, unknown>) =>
    [...attendanceQueryKeys.all, 'search', params ?? {}] as const,
  eligibilities: (clientId?: string) =>
    clientId
      ? ([...attendanceQueryKeys.all, 'eligibility', clientId] as const)
      : ([...attendanceQueryKeys.all, 'eligibility'] as const),
  eligibility: (clientId?: string, asOf?: string) =>
    [...attendanceQueryKeys.all, 'eligibility', clientId, asOf] as const,
  clientSearches: () => [...attendanceQueryKeys.all, 'client-search'] as const,
  clientSearch: (query: string) => [...attendanceQueryKeys.all, 'client-search', query] as const,
};
