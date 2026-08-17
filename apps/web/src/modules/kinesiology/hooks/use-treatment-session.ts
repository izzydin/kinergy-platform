import { useQuery } from '@tanstack/react-query';
import { kinesiologyApi } from '../api/kinesiology-api';
import { TreatmentSessionModel } from '../types';

export const kinesiologyQueryKeys = {
  all: ['kinesiology'] as const,
  sessions: () => [...kinesiologyQueryKeys.all, 'sessions'] as const,
  session: (id: string) => [...kinesiologyQueryKeys.sessions(), id] as const,
  histories: () => [...kinesiologyQueryKeys.all, 'history'] as const,
  history: (clientId: string, filters?: Record<string, unknown>) =>
    [...kinesiologyQueryKeys.histories(), clientId, filters] as const,
};

export function useTreatmentSession(sessionId: string | undefined) {
  return useQuery<TreatmentSessionModel, Error>({
    queryKey: kinesiologyQueryKeys.session(sessionId ?? ''),
    queryFn: () => {
      if (!sessionId) {
        throw new Error('Session ID is required');
      }
      return kinesiologyApi.getSessionById(sessionId);
    },
    enabled: Boolean(sessionId && sessionId.trim().length > 0),
    staleTime: 30 * 1000, // 30 seconds
  });
}
