import { useQuery } from '@tanstack/react-query';
import { fetchAIHealth } from '../api/health.api';
import type { IntelligenceHealthState } from '../types';

export const AI_HEALTH_QUERY_KEY = ['intelligence', 'health'] as const;

/**
 * TanStack Query hook providing live AI subsystem health metrics.
 * Refetches every 30 seconds or when window refocusses.
 */
export function useAIHealth() {
  return useQuery<IntelligenceHealthState>({
    queryKey: AI_HEALTH_QUERY_KEY,
    queryFn: fetchAIHealth,
    staleTime: 15_000,
    refetchInterval: 30_000,
    retry: 1,
  });
}
