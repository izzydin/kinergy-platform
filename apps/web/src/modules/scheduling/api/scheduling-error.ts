import {
  ApiError,
  ValidationError,
  ConflictError,
  NotFoundError,
  AuthorizationError,
  AuthenticationError,
  NetworkError,
  normalizeApiError,
} from '../../../shared/api/api-error';
import type { ConflictDiagnosticItem } from '../types/scheduling.types';

/**
 * Type guard identifying if an error contains 409 Conflict diagnostic details
 * from scheduling conflict detection (e.g. therapist overlap, room maintenance).
 */
export function isSchedulingConflictError(
  error: unknown,
): error is ConflictError & { conflicts?: ConflictDiagnosticItem[] } {
  if (error instanceof ConflictError) {
    return true;
  }
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as { statusCode?: number; status?: number; conflicts?: unknown };
  if (
    (candidate.statusCode === 409 || candidate.status === 409) &&
    Array.isArray(candidate.conflicts)
  ) {
    return true;
  }

  return false;
}

/**
 * Extracts structured ConflictDiagnosticItem[] from an unknown error if present.
 */
export function getSchedulingConflictDetails(error: unknown): ConflictDiagnosticItem[] {
  if (!error || typeof error !== 'object') {
    return [];
  }

  const candidate = error as {
    conflicts?: unknown;
    responseData?: { conflicts?: unknown };
    details?: { conflicts?: unknown };
  };

  if (Array.isArray(candidate.conflicts)) {
    return candidate.conflicts as ConflictDiagnosticItem[];
  }
  if (candidate.responseData && Array.isArray(candidate.responseData.conflicts)) {
    return candidate.responseData.conflicts as ConflictDiagnosticItem[];
  }
  if (candidate.details && Array.isArray(candidate.details.conflicts)) {
    return candidate.details.conflicts as ConflictDiagnosticItem[];
  }

  return [];
}

/**
 * Type guard for optimistic concurrency version mismatch (HTTP 409 or 412).
 */
export function isOptimisticLockError(error: unknown): boolean {
  if (error instanceof ApiError && (error.statusCode === 409 || error.statusCode === 412)) {
    const msg = error.message.toLowerCase();
    return msg.includes('version') || msg.includes('concurrency') || msg.includes('modified');
  }
  if (error && typeof error === 'object') {
    const cand = error as { statusCode?: number; status?: number; message?: string };
    const code = cand.statusCode || cand.status;
    const msg = (cand.message || '').toLowerCase();
    if (
      (code === 409 || code === 412) &&
      (msg.includes('version') || msg.includes('concurrency'))
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Type guard identifying room maintenance window conflicts.
 */
export function isRoomMaintenanceConflict(error: unknown): boolean {
  const conflicts = getSchedulingConflictDetails(error);
  if (
    conflicts.some(
      (c) => c.category === 'MAINTENANCE' || c.reason.toLowerCase().includes('maintenance'),
    )
  ) {
    return true;
  }
  const msg = error instanceof Error ? error.message.toLowerCase() : '';
  return msg.includes('maintenance');
}

/**
 * Type guard identifying therapist availability or working hours conflicts.
 */
export function isTherapistUnavailableConflict(error: unknown): boolean {
  const conflicts = getSchedulingConflictDetails(error);
  if (
    conflicts.some(
      (c) =>
        c.category === 'THERAPIST' || c.category === 'WORKING_HOURS' || c.category === 'VACATION',
    )
  ) {
    return true;
  }
  const msg = error instanceof Error ? error.message.toLowerCase() : '';
  return msg.includes('therapist') || msg.includes('working hours') || msg.includes('vacation');
}

/**
 * Type guard identifying invalid appointment state machine transitions (e.g. attempting to cancel a completed appointment).
 */
export function isAppointmentStateTransitionError(error: unknown): boolean {
  if (error instanceof ApiError && (error.statusCode === 400 || error.statusCode === 422)) {
    const msg = error.message.toLowerCase();
    return msg.includes('transition') || msg.includes('terminal') || msg.includes('cannot');
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return msg.includes('transition') || msg.includes('terminal');
  }
  return false;
}

/**
 * Formats server errors into user-friendly, actionable diagnostic messages for the UI.
 */
export function formatSchedulingErrorMessage(
  error: unknown,
  fallbackMessage = 'An unexpected scheduling error occurred.',
): string {
  if (!error) {
    return fallbackMessage;
  }

  const conflicts = getSchedulingConflictDetails(error);
  if (conflicts.length > 0) {
    return conflicts.map((c) => c.reason).join(' ');
  }

  const normalized = normalizeApiError(error);

  if (isOptimisticLockError(normalized)) {
    return 'This record was modified by another staff member. Please refresh to load the latest state.';
  }

  if (normalized instanceof AuthorizationError) {
    return 'You do not have permission to perform this scheduling operation.';
  }

  if (normalized instanceof AuthenticationError) {
    return 'Your session has expired. Please log in again to continue.';
  }

  if (normalized instanceof NotFoundError) {
    return 'The requested appointment, room, or series was not found.';
  }

  if (normalized instanceof ValidationError && normalized.details) {
    const firstDetail = Object.values(normalized.details)[0];
    if (firstDetail && firstDetail.length > 0) {
      return `${normalized.message} (${firstDetail[0]})`;
    }
  }

  if (normalized instanceof NetworkError) {
    return 'Unable to connect to the scheduling service. Please check your internet connection.';
  }

  if (normalized.message && normalized.message.trim().length > 0) {
    return normalized.message;
  }

  return fallbackMessage;
}
