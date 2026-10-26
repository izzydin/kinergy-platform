import { useQuery } from '@tanstack/react-query';
import { kinesiologyApi } from '../api/kinesiology-api';
import { kinesiologyQueryKeys } from '../api/kinesiology-query-keys';
import type { TreatmentSessionModel, SoapNotesData } from '../types';

export { kinesiologyQueryKeys };

/**
 * Hook to retrieve full clinical TreatmentSession aggregate details by ID.
 */
export function useTreatmentSession(
  sessionId: string | undefined,
  options?: { enabled?: boolean },
) {
  const isEnabled =
    options?.enabled !== undefined
      ? options.enabled
      : Boolean(sessionId && sessionId.trim().length > 0);
  return useQuery<TreatmentSessionModel, Error>({
    queryKey: kinesiologyQueryKeys.session(sessionId ?? ''),
    queryFn: () => {
      if (!sessionId) {
        throw new Error('Session ID is required');
      }
      return kinesiologyApi.getSessionById(sessionId);
    },
    enabled: isEnabled,
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Scoped hook retrieving clinical progress notes for a treatment session.
 */
export function useSessionNotes(sessionId: string | undefined) {
  return useQuery<TreatmentSessionModel, Error, SoapNotesData>({
    queryKey: kinesiologyQueryKeys.sessionNotes(sessionId ?? ''),
    queryFn: () => {
      if (!sessionId) {
        throw new Error('Session ID is required');
      }
      return kinesiologyApi.getSessionById(sessionId);
    },
    select: (session) => session.notes,
    enabled: Boolean(sessionId && sessionId.trim().length > 0),
    staleTime: 30 * 1000,
  });
}

/**
 * Scoped hook retrieving client and appointment correlation context for a session.
 */
export function useSessionContext(sessionId: string | undefined) {
  return useQuery({
    queryKey: kinesiologyQueryKeys.sessionContext(sessionId ?? ''),
    queryFn: () => {
      if (!sessionId) {
        throw new Error('Session ID is required');
      }
      return kinesiologyApi.getSessionById(sessionId);
    },
    select: (session) => ({
      sessionId: session.id,
      clientId: session.clientId,
      therapistId: session.therapistId,
      appointmentId: session.appointmentId,
      status: session.status,
      version: session.version,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    }),
    enabled: Boolean(sessionId && sessionId.trim().length > 0),
    staleTime: 30 * 1000,
  });
}

/**
 * Scoped hook retrieving therapist assignment context for a session.
 */
export function useSessionTherapist(sessionId: string | undefined) {
  return useQuery({
    queryKey: kinesiologyQueryKeys.sessionTherapist(sessionId ?? ''),
    queryFn: () => {
      if (!sessionId) {
        throw new Error('Session ID is required');
      }
      return kinesiologyApi.getSessionById(sessionId);
    },
    select: (session) => ({
      sessionId: session.id,
      therapistId: session.therapistId,
      status: session.status,
    }),
    enabled: Boolean(sessionId && sessionId.trim().length > 0),
    staleTime: 30 * 1000,
  });
}
