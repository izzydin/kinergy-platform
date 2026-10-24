import {
  ApiError,
  ValidationError,
  ConflictError,
  NotFoundError,
  AuthenticationError,
  AuthorizationError,
  NetworkError,
  RateLimitError,
  ServerError,
  normalizeApiError,
} from '../../../shared/api/api-error';
import type { PotentialMatchesWarningDTO } from '../types/client.types';

/**
 * Type guard checking if an error is a soft-duplicate 409 conflict payload
 * containing potential matching client profiles.
 */
export function isPotentialDuplicatesWarning(error: unknown): error is PotentialMatchesWarningDTO {
  if (!error || typeof error !== 'object') {
    return false;
  }

  // Check if error itself is the payload or if it's attached to details or responseData
  const candidate = error as Partial<PotentialMatchesWarningDTO> & {
    details?: unknown;
    responseData?: unknown;
    statusCode?: number;
  };

  if (
    candidate.status === 'POTENTIAL_DUPLICATES_FOUND' &&
    Array.isArray(candidate.potentialMatches)
  ) {
    return true;
  }

  if (
    candidate.responseData &&
    typeof candidate.responseData === 'object' &&
    (candidate.responseData as { status?: string }).status === 'POTENTIAL_DUPLICATES_FOUND' &&
    Array.isArray((candidate.responseData as { potentialMatches?: unknown }).potentialMatches)
  ) {
    return true;
  }

  // When wrapped in ApiError details or json payload
  if (
    candidate.details &&
    typeof candidate.details === 'object' &&
    (candidate.details as { status?: string }).status === 'POTENTIAL_DUPLICATES_FOUND'
  ) {
    return true;
  }

  return false;
}

/**
 * Extracts the structured PotentialMatchesWarningDTO from an error if present.
 */
export function getPotentialMatchesWarning(error: unknown): PotentialMatchesWarningDTO | null {
  if (!isPotentialDuplicatesWarning(error)) {
    return null;
  }

  const candidate = error as unknown as Record<string, unknown>;
  if (
    candidate.status === 'POTENTIAL_DUPLICATES_FOUND' &&
    Array.isArray(candidate.potentialMatches)
  ) {
    return candidate as unknown as PotentialMatchesWarningDTO;
  }
  if (
    candidate.responseData &&
    typeof candidate.responseData === 'object' &&
    (candidate.responseData as Record<string, unknown>).status === 'POTENTIAL_DUPLICATES_FOUND'
  ) {
    return candidate.responseData as unknown as PotentialMatchesWarningDTO;
  }
  if (
    candidate.details &&
    typeof candidate.details === 'object' &&
    (candidate.details as Record<string, unknown>).status === 'POTENTIAL_DUPLICATES_FOUND'
  ) {
    return candidate.details as unknown as PotentialMatchesWarningDTO;
  }

  return null;
}

/**
 * Type guard for HTTP 412 Precondition Failed (optimistic version lock mismatch)
 */
export function isOptimisticLockError(error: unknown): boolean {
  if (error instanceof ApiError && error.statusCode === 412) {
    return true;
  }
  if (error && typeof error === 'object' && (error as { statusCode?: number }).statusCode === 412) {
    return true;
  }
  return false;
}

/**
 * Type guard for HTTP 422 Unprocessable Entity (e.g. attempting to update an archived client)
 */
export function isArchivedClientError(error: unknown): boolean {
  if (error instanceof ApiError && error.statusCode === 422) {
    return true;
  }
  if (error && typeof error === 'object' && (error as { statusCode?: number }).statusCode === 422) {
    return true;
  }
  return false;
}

/**
 * Type guard for HTTP 409 Conflict (hard unique constraint violation on active client)
 */
export function isHardDuplicateError(error: unknown): boolean {
  if (isPotentialDuplicatesWarning(error)) {
    return false;
  }
  if (error instanceof ConflictError) {
    return true;
  }
  if (error instanceof ApiError && error.statusCode === 409) {
    return true;
  }
  if (error && typeof error === 'object' && (error as { statusCode?: number }).statusCode === 409) {
    return true;
  }
  return false;
}

/**
 * Type guard for HTTP 404 Not Found
 */
export function isNotFoundError(error: unknown): boolean {
  if (error instanceof NotFoundError) {
    return true;
  }
  if (error instanceof ApiError && error.statusCode === 404) {
    return true;
  }
  if (error && typeof error === 'object' && (error as { statusCode?: number }).statusCode === 404) {
    return true;
  }
  return false;
}

/**
 * Type guard for HTTP 403 Forbidden
 */
export function isForbiddenError(error: unknown): boolean {
  if (error instanceof AuthorizationError) {
    return true;
  }
  if (error instanceof ApiError && error.statusCode === 403) {
    return true;
  }
  if (error && typeof error === 'object' && (error as { statusCode?: number }).statusCode === 403) {
    return true;
  }
  return false;
}

/**
 * Formats client domain errors into safe, human-readable user messages
 * with zero raw stack traces or internal database exceptions exposed.
 */
export function formatClientErrorMessage(error: unknown): string {
  if (isPotentialDuplicatesWarning(error)) {
    return 'Potential duplicate profiles were detected with matching phone numbers or similar names.';
  }

  if (isOptimisticLockError(error)) {
    return 'This client record was updated by another user. Please reload the page to review the latest changes.';
  }

  if (isArchivedClientError(error)) {
    return 'Archived client profiles cannot be modified. Please restore the client before editing.';
  }

  if (isHardDuplicateError(error)) {
    const apiErr = normalizeApiError(error);
    return (
      apiErr.message || 'An active client with this email address or phone number already exists.'
    );
  }

  if (isNotFoundError(error)) {
    return 'The requested client profile could not be found.';
  }

  if (isForbiddenError(error)) {
    return 'You do not have permission to perform this client action.';
  }

  if (error instanceof ValidationError) {
    return error.message || 'Please check your input and correct any validation errors.';
  }

  if (error instanceof AuthenticationError) {
    return 'Your session has expired. Please log in again.';
  }

  if (error instanceof RateLimitError) {
    return 'Too many requests. Please wait a moment and try again.';
  }

  if (error instanceof NetworkError) {
    return 'Network connection issue. Please check your internet connection.';
  }

  if (error instanceof ServerError) {
    return 'A server error occurred while processing the client request. Please try again later.';
  }

  const normalized = normalizeApiError(error);
  return normalized.message || 'An unexpected error occurred.';
}
