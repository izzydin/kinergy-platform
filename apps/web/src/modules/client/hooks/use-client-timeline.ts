import { useQuery } from '@tanstack/react-query';
import { clientTimelineApi } from '../api/client-timeline-api';
import { PaginatedClientTimeline, ClientTimelineParams } from '../types';

export const clientTimelineQueryKeys = {
  all: ['timeline'] as const,
  client: (clientId: string, params?: ClientTimelineParams) =>
    [...clientTimelineQueryKeys.all, clientId, params] as const,
};

export function useClientTimeline(clientId: string | undefined, params?: ClientTimelineParams) {
  return useQuery<PaginatedClientTimeline, Error>({
    queryKey: clientTimelineQueryKeys.client(clientId ?? '', params),
    queryFn: () => {
      if (!clientId) {
        throw new Error('Client ID is required');
      }
      return clientTimelineApi.getClientTimeline(clientId, params);
    },
    enabled: Boolean(clientId && clientId.trim().length > 0),
    placeholderData: (previousData) => previousData,
    staleTime: 15 * 1000,
  });
}
