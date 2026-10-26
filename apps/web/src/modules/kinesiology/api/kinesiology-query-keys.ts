import type { TreatmentHistoryFilterParams } from '../types';

/**
 * Stable, hierarchical TanStack Query keys for the Kinesiology Clinical Bounded Context.
 * Ensures deterministic cache scoping and targeted invalidation without cross-feature leakage.
 */
export const kinesiologyQueryKeys = {
  all: ['kinesiology'] as const,

  // Root namespace for sessions
  sessions: () => [...kinesiologyQueryKeys.all, 'sessions'] as const,

  // Session details query key
  session: (sessionId: string) => [...kinesiologyQueryKeys.sessions(), sessionId] as const,

  // Scoped session clinical notes query key
  sessionNotes: (sessionId: string) =>
    [...kinesiologyQueryKeys.session(sessionId), 'notes'] as const,

  // Scoped session client and appointment context query key
  sessionContext: (sessionId: string) =>
    [...kinesiologyQueryKeys.session(sessionId), 'context'] as const,

  // Scoped therapist assignment context query key
  sessionTherapist: (sessionId: string) =>
    [...kinesiologyQueryKeys.session(sessionId), 'therapist'] as const,

  // Root namespace for client history queries
  histories: () => [...kinesiologyQueryKeys.all, 'history'] as const,

  // Client treatment history query key with optional filter parameters
  history: (clientId: string, filters?: TreatmentHistoryFilterParams) =>
    filters
      ? ([...kinesiologyQueryKeys.histories(), clientId, filters] as const)
      : ([...kinesiologyQueryKeys.histories(), clientId] as const),
};
