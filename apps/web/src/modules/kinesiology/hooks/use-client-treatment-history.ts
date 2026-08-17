import { useQuery } from '@tanstack/react-query';
import { kinesiologyApi } from '../api/kinesiology-api';
import { PaginatedTreatmentHistory, TreatmentHistoryFilterParams } from '../types';
import { kinesiologyQueryKeys } from './use-treatment-session';

export function useClientTreatmentHistory(
  clientId: string | undefined,
  filters?: TreatmentHistoryFilterParams,
) {
  return useQuery<PaginatedTreatmentHistory, Error>({
    queryKey: kinesiologyQueryKeys.history(clientId ?? '', filters as Record<string, unknown>),
    queryFn: () => {
      if (!clientId) {
        throw new Error('Client ID is required');
      }
      return kinesiologyApi.getClientTreatmentHistory(clientId, filters);
    },
    enabled: Boolean(clientId && clientId.trim().length > 0),
    placeholderData: (previousData) => previousData,
  });
}
