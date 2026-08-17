import { httpClient } from '../../../shared/api/http-client';
import { PaginatedClientTimeline, ClientTimelineParams } from '../types';

export const clientTimelineApi = {
  getClientTimeline(
    clientId: string,
    params?: ClientTimelineParams,
  ): Promise<PaginatedClientTimeline> {
    return httpClient.get<PaginatedClientTimeline>(`/api/v1/clients/${clientId}/timeline`, {
      params: params as Record<string, string | number | boolean | null | undefined>,
    });
  },
};
