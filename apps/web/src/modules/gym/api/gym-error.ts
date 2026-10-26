import {
  ApiError,
  ConflictError,
  ValidationError,
  NotFoundError,
  AuthorizationError,
  AuthenticationError,
  NetworkError,
  RequestCanceledError,
  ServerError,
  normalizeApiError,
} from '../../../shared/api/api-error';
import { AccessResult, MembershipEligibilityOutcome } from '../attendance/types';

/**
 * Thrown or identified when admission or enrollment eligibility is denied by the gym domain.
 * Preserves structured diagnostic outcome codes (e.g. DENIED_EXPIRED, DENIED_FROZEN, INACTIVE_CLIENT).
 */
export class GymEligibilityError extends ApiError {
  readonly isRecoverable = true;

  constructor(
    public readonly outcome: string,
    message: string = `Admission denied: ${outcome}`,
    public readonly clientId?: string,
    correlationId?: string,
  ) {
    super(message, 422, outcome, undefined, correlationId);
  }
}

/**
 * Thrown or identified when a turnstile admission is rejected due to rapid scan within the 5-minute anti-passback cooldown.
 */
export class GymDuplicateCheckInError extends ConflictError {
  constructor(
    message = 'Duplicate check-in: Access was already recorded for this member within the last 5 minutes.',
    correlationId?: string,
    public readonly clientId?: string,
  ) {
    super(message, correlationId);
  }
}

/**
 * Thrown when an agreement period conflicts with an existing active membership for the same client.
 */
export class GymMembershipOverlapError extends ConflictError {
  constructor(
    message = 'Client already has an active membership covering this date interval.',
    correlationId?: string,
  ) {
    super(message, correlationId);
  }
}

/**
 * Thrown when concurrent modifications to the same membership or plan collide (OCC version mismatch).
 */
export class GymConcurrencyError extends ConflictError {
  constructor(
    message = 'This record was modified concurrently by another user or process. Please refresh.',
    correlationId?: string,
  ) {
    super(message, correlationId);
  }
}

/**
 * Thrown when attempting to update pricing, publish, or sell an archived commercial plan (ADR-0059).
 */
export class GymPlanArchivedError extends ApiError {
  readonly isRecoverable = false;

  constructor(
    message = 'Archived membership plans cannot be published or have pricing modified.',
    correlationId?: string,
  ) {
    super(message, 400, 'PLAN_ARCHIVED', undefined, correlationId);
  }
}

/**
 * Type guard for gym eligibility denials (from structured API responses or domain errors).
 */
export function isGymEligibilityRejection(error: unknown): boolean {
  if (error instanceof GymEligibilityError) {
    return true;
  }
  if (error && typeof error === 'object') {
    const outcome = 'outcome' in error ? String((error as { outcome?: unknown }).outcome) : '';
    if (
      outcome.startsWith('DENIED_') ||
      outcome === MembershipEligibilityOutcome.EXPIRED ||
      outcome === MembershipEligibilityOutcome.MEMBERSHIP_EXPIRED ||
      outcome === MembershipEligibilityOutcome.FROZEN ||
      outcome === MembershipEligibilityOutcome.MEMBERSHIP_FROZEN ||
      outcome === MembershipEligibilityOutcome.NO_MEMBERSHIP ||
      outcome === MembershipEligibilityOutcome.NO_ACTIVE_MEMBERSHIP ||
      outcome === MembershipEligibilityOutcome.NOT_YET_ACTIVE ||
      outcome === MembershipEligibilityOutcome.FUTURE_START_DATE ||
      outcome === MembershipEligibilityOutcome.CANCELLED ||
      outcome === MembershipEligibilityOutcome.MEMBERSHIP_CANCELLED ||
      outcome === MembershipEligibilityOutcome.TERMINATED ||
      outcome === MembershipEligibilityOutcome.INACTIVE_CLIENT
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Type guard for turnstile anti-passback duplicate scan rejection (5-minute cooldown).
 */
export function isDuplicateCheckIn(error: unknown): boolean {
  if (error instanceof GymDuplicateCheckInError) {
    return true;
  }
  if (error && typeof error === 'object') {
    const outcome = 'outcome' in error ? String((error as { outcome?: unknown }).outcome) : '';
    if (outcome === AccessResult.DENIED_DUPLICATE_CHECKIN) {
      return true;
    }
    const msg =
      'message' in error && typeof (error as { message?: unknown }).message === 'string'
        ? (error as { message: string }).message.toLowerCase()
        : '';
    return (
      msg.includes('duplicate') &&
      (msg.includes('check-in') || msg.includes('passback') || msg.includes('5 minutes'))
    );
  }
  return false;
}

/**
 * Type guard for membership interval overlap conflict (HTTP 400 or 409).
 */
export function isMembershipOverlapConflict(error: unknown): boolean {
  if (error instanceof GymMembershipOverlapError) {
    return true;
  }
  if (error && typeof error === 'object') {
    const msg =
      'message' in error && typeof (error as { message?: unknown }).message === 'string'
        ? (error as { message: string }).message.toLowerCase()
        : '';
    return (
      msg.includes('overlap') ||
      msg.includes('active membership') ||
      (msg.includes('membership') &&
        (msg.includes('conflict') || msg.includes('exists') || msg.includes('cover')))
    );
  }
  return false;
}

/**
 * Type guard for optimistic concurrency version conflict (HTTP 409).
 */
export function isGymConcurrencyConflict(error: unknown): boolean {
  if (error instanceof GymConcurrencyError) {
    return true;
  }
  if (error && typeof error === 'object') {
    const code = 'code' in error ? String((error as { code?: unknown }).code) : '';
    if (code === 'CONCURRENT_MODIFICATION' || code === 'VERSION_MISMATCH') {
      return true;
    }
    const statusCode = 'statusCode' in error ? (error as { statusCode?: number }).statusCode : 0;
    if (statusCode === 409) {
      const msg =
        'message' in error && typeof (error as { message?: unknown }).message === 'string'
          ? (error as { message: string }).message.toLowerCase()
          : '';
      return (
        msg.includes('version') ||
        msg.includes('concurrency') ||
        msg.includes('modified') ||
        msg.includes('conflict')
      );
    }
  }
  return false;
}

/**
 * Type guard for archived commercial plan operation rejection.
 */
export function isPlanArchivedConflict(error: unknown): boolean {
  if (error instanceof GymPlanArchivedError) {
    return true;
  }
  if (error && typeof error === 'object') {
    const msg =
      'message' in error && typeof (error as { message?: unknown }).message === 'string'
        ? (error as { message: string }).message.toLowerCase()
        : '';
    return (
      msg.includes('archived') &&
      (msg.includes('publish') || msg.includes('pricing') || msg.includes('cannot'))
    );
  }
  return false;
}

/**
 * Type guard for permission denial (HTTP 403 Forbidden).
 */
export function isAuthorizationDenied(error: unknown): boolean {
  if (error instanceof AuthorizationError) {
    return true;
  }
  if (error && typeof error === 'object') {
    const status =
      'statusCode' in error
        ? (error as { statusCode?: number }).statusCode
        : 'status' in error
          ? (error as { status?: number }).status
          : 0;
    return status === 403;
  }
  return false;
}

/**
 * Type guard for not found responses (HTTP 404).
 */
export function isGymResourceNotFound(error: unknown): boolean {
  if (error instanceof NotFoundError) {
    return true;
  }
  if (error && typeof error === 'object') {
    const status =
      'statusCode' in error
        ? (error as { statusCode?: number }).statusCode
        : 'status' in error
          ? (error as { status?: number }).status
          : 0;
    return status === 404;
  }
  return false;
}

/**
 * Normalizes any error from gym operations into a typed, structured ApiError instance.
 */
export function normalizeGymError(error: unknown): ApiError {
  if (
    error instanceof GymEligibilityError ||
    error instanceof GymDuplicateCheckInError ||
    error instanceof GymMembershipOverlapError ||
    error instanceof GymConcurrencyError ||
    error instanceof GymPlanArchivedError
  ) {
    return error;
  }

  if (isDuplicateCheckIn(error)) {
    const msg =
      error instanceof Error
        ? error.message
        : 'Access was already recorded for this member within the last 5 minutes.';
    return new GymDuplicateCheckInError(msg);
  }

  if (isMembershipOverlapConflict(error)) {
    const msg =
      error instanceof Error
        ? error.message
        : 'Client already has an active membership covering this date interval.';
    return new GymMembershipOverlapError(msg);
  }

  if (isPlanArchivedConflict(error)) {
    const msg =
      error instanceof Error
        ? error.message
        : 'Archived membership plans cannot be published or have pricing modified.';
    return new GymPlanArchivedError(msg);
  }

  if (isGymConcurrencyConflict(error)) {
    const msg =
      error instanceof Error
        ? error.message
        : 'This record was modified concurrently. Please refresh the page.';
    return new GymConcurrencyError(msg);
  }

  return normalizeApiError(error);
}

/**
 * Safely extracts user-facing error message without leaking sensitive member details or raw tokens.
 */
export function getGymErrorMessage(error: unknown): string {
  const normalized = normalizeGymError(error);

  if (normalized instanceof ValidationError) {
    if (normalized.details) {
      const messages = Object.values(normalized.details).flat();
      if (messages.length > 0) return messages.join('; ');
    }
    return normalized.message;
  }

  if (normalized instanceof AuthorizationError) {
    return 'You do not possess permission to perform this gym operation.';
  }

  if (normalized instanceof NotFoundError) {
    return normalized.message || 'The requested gym record was not found.';
  }

  if (normalized instanceof GymDuplicateCheckInError) {
    return 'Access was already recorded for this member within the last 5 minutes (anti-passback cooldown).';
  }

  if (normalized instanceof GymMembershipOverlapError) {
    return 'Cannot enroll member: an active membership already covers this date interval.';
  }

  if (normalized instanceof GymPlanArchivedError) {
    return 'Cannot modify or publish an archived membership plan.';
  }

  if (normalized instanceof GymConcurrencyError) {
    return 'This record was updated concurrently by another user. Please refresh and retry.';
  }

  if (normalized instanceof NetworkError) {
    return 'Network request failed. Please check your connection and retry.';
  }

  if (normalized instanceof RequestCanceledError) {
    return 'Request was canceled.';
  }

  if (normalized instanceof ServerError || normalized.statusCode >= 500) {
    return 'An unexpected server error occurred during gym operation.';
  }

  return normalized.message || 'An unexpected error occurred.';
}

export {
  ApiError,
  ValidationError,
  ConflictError,
  NotFoundError,
  AuthorizationError,
  AuthenticationError,
  NetworkError,
  RequestCanceledError,
  ServerError,
};
