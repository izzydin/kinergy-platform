import {
  ApiError,
  ConflictError,
  ValidationError,
  NotFoundError,
  AuthorizationError,
  AuthenticationError,
  NetworkError,
  normalizeApiError,
} from '../../../shared/api/api-error';

/**
 * Thrown when an invalid session lifecycle transition is rejected by the domain aggregate.
 * (e.g. attempting to start an already completed encounter or complete an unstarted session).
 */
export class KinesiologyStateTransitionError extends ApiError {
  readonly isRecoverable = true;

  constructor(
    message = 'The requested session lifecycle transition is invalid.',
    correlationId?: string,
  ) {
    super(message, 422, 'INVALID_STATE_TRANSITION', undefined, correlationId);
  }
}

/**
 * Thrown when attempting to edit clinical notes or reassign practitioners on a finalized,
 * signed, cancelled, or no-show clinical encounter protected by medico-legal immutability.
 */
export class KinesiologyRecordLockedError extends ApiError {
  readonly isRecoverable = false; // Terminal state cannot be reopened or edited

  constructor(
    message = 'Clinical encounter documentation is finalized and permanently locked.',
    correlationId?: string,
  ) {
    super(message, 422, 'RECORD_LOCKED', undefined, correlationId);
  }
}

/**
 * Thrown when attempting to create a second treatment session for an appointment that already has one.
 */
export class KinesiologyDuplicateSessionError extends ConflictError {
  constructor(
    message = 'A TreatmentSession already exists for this appointment.',
    correlationId?: string,
  ) {
    super(message, correlationId);
  }
}

/**
 * Thrown when concurrent modifications to the same clinical session collide (OCC version mismatch).
 */
export class KinesiologyConcurrencyError extends ConflictError {
  constructor(
    message = 'This treatment session was modified concurrently by another user.',
    correlationId?: string,
  ) {
    super(message, correlationId);
  }
}

/**
 * Type guard for invalid state machine transition errors (HTTP 422).
 */
export function isStateTransitionConflict(error: unknown): boolean {
  if (error instanceof KinesiologyStateTransitionError) {
    return true;
  }
  if (error && typeof error === 'object') {
    const code = 'code' in error ? String((error as { code?: unknown }).code) : '';
    if (
      code === 'TREATMENT_SESSION_INVALID_STATE_TRANSITION' ||
      code === 'INVALID_STATE_TRANSITION'
    ) {
      return true;
    }
    const statusCode = 'statusCode' in error ? (error as { statusCode?: number }).statusCode : 0;
    if (statusCode === 422) {
      const msg =
        'message' in error && typeof (error as { message?: unknown }).message === 'string'
          ? (error as { message: string }).message.toLowerCase()
          : '';
      return msg.includes('transition') || msg.includes('status') || msg.includes('must be in');
    }
  }
  return false;
}

/**
 * Type guard for completed or cancelled clinical record immutability locks (HTTP 422).
 */
export function isClinicalRecordLocked(error: unknown): boolean {
  if (error instanceof KinesiologyRecordLockedError) {
    return true;
  }
  if (error instanceof KinesiologyStateTransitionError) {
    return false;
  }
  if (error && typeof error === 'object') {
    const code = 'code' in error ? String((error as { code?: unknown }).code) : '';
    if (code === 'CLINICAL_RECORD_LOCKED' || code === 'RECORD_LOCKED') {
      return true;
    }
    if (
      code === 'TREATMENT_SESSION_INVALID_STATE_TRANSITION' ||
      code === 'INVALID_STATE_TRANSITION'
    ) {
      return false;
    }
    const statusCode = 'statusCode' in error ? (error as { statusCode?: number }).statusCode : 0;
    if (statusCode === 422) {
      const msg =
        'message' in error && typeof (error as { message?: unknown }).message === 'string'
          ? (error as { message: string }).message.toLowerCase()
          : '';
      if (msg.includes('transition') || msg.includes('lifecycle')) {
        return false;
      }
      return (
        msg.includes('lock') ||
        msg.includes('finalized') ||
        msg.includes('signed') ||
        msg.includes('permanently') ||
        ((msg.includes('completed') || msg.includes('cancelled') || msg.includes('no_show')) &&
          (msg.includes('cannot update') ||
            msg.includes('cannot edit') ||
            msg.includes('prohibited') ||
            msg.includes('terminal')))
      );
    }
  }
  return false;
}

/**
 * Type guard for duplicate session conflict (HTTP 409).
 */
export function isDuplicateSessionConflict(error: unknown): boolean {
  if (error instanceof KinesiologyDuplicateSessionError) {
    return true;
  }
  if (error && typeof error === 'object') {
    const code = 'code' in error ? String((error as { code?: unknown }).code) : '';
    if (code === 'DUPLICATE_TREATMENT_SESSION' || code === 'SESSION_ALREADY_EXISTS') {
      return true;
    }
    const statusCode = 'statusCode' in error ? (error as { statusCode?: number }).statusCode : 0;
    if (statusCode === 409) {
      const msg =
        'message' in error && typeof (error as { message?: unknown }).message === 'string'
          ? (error as { message: string }).message.toLowerCase()
          : '';
      return msg.includes('already exists') || msg.includes('duplicate');
    }
  }
  return false;
}

/**
 * Type guard for optimistic concurrency version mismatch (HTTP 409).
 */
export function isOptimisticConcurrencyConflict(error: unknown): boolean {
  if (error instanceof KinesiologyConcurrencyError) {
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
        msg.includes('concurrent') ||
        msg.includes('modified')
      );
    }
  }
  return false;
}

/**
 * Type guard for appointment clinical eligibility rejection (HTTP 422).
 */
export function isAppointmentIneligibleError(error: unknown): boolean {
  if (error && typeof error === 'object') {
    const code = 'code' in error ? String((error as { code?: unknown }).code) : '';
    if (code === 'APPOINTMENT_INELIGIBLE_FOR_TREATMENT') return true;
    const msg =
      'message' in error && typeof (error as { message?: unknown }).message === 'string'
        ? (error as { message: string }).message.toLowerCase()
        : '';
    return (
      msg.includes('appointment') &&
      (msg.includes('eligible') || msg.includes('service') || msg.includes('confirmed'))
    );
  }
  return false;
}

/**
 * Type guard for practitioner clinical eligibility rejection (HTTP 422).
 */
export function isTherapistEligibilityError(error: unknown): boolean {
  if (error && typeof error === 'object') {
    const code = 'code' in error ? String((error as { code?: unknown }).code) : '';
    if (code === 'THERAPIST_NOT_ELIGIBLE') return true;
    const msg =
      'message' in error && typeof (error as { message?: unknown }).message === 'string'
        ? (error as { message: string }).message.toLowerCase()
        : '';
    return (
      (msg.includes('practitioner') || msg.includes('therapist')) &&
      (msg.includes('eligible') || msg.includes('active'))
    );
  }
  return false;
}

/**
 * Normalizes any raw error, network failure, or API payload into a structured, typed ApiError.
 * Ensures clinical domain semantics are preserved without leaking raw note content.
 */
export function normalizeKinesiologyError(error: unknown): ApiError {
  if (
    error instanceof KinesiologyRecordLockedError ||
    error instanceof KinesiologyStateTransitionError ||
    error instanceof KinesiologyDuplicateSessionError ||
    error instanceof KinesiologyConcurrencyError
  ) {
    return error;
  }

  if (isStateTransitionConflict(error)) {
    const msg =
      error instanceof Error
        ? error.message
        : 'The requested session lifecycle transition is invalid.';
    const correlationId = error instanceof ApiError ? error.correlationId : undefined;
    return new KinesiologyStateTransitionError(msg, correlationId);
  }

  if (isClinicalRecordLocked(error)) {
    const msg =
      error instanceof Error
        ? error.message
        : 'Clinical record is finalized and permanently locked.';
    const correlationId = error instanceof ApiError ? error.correlationId : undefined;
    return new KinesiologyRecordLockedError(msg, correlationId);
  }

  if (isDuplicateSessionConflict(error)) {
    const msg =
      error instanceof Error
        ? error.message
        : 'A TreatmentSession already exists for this appointment.';
    const correlationId = error instanceof ApiError ? error.correlationId : undefined;
    return new KinesiologyDuplicateSessionError(msg, correlationId);
  }

  if (isOptimisticConcurrencyConflict(error)) {
    const msg =
      error instanceof Error
        ? error.message
        : 'This treatment session was modified concurrently by another user.';
    const correlationId = error instanceof ApiError ? error.correlationId : undefined;
    return new KinesiologyConcurrencyError(msg, correlationId);
  }

  return normalizeApiError(error);
}

/**
 * Safely extracts a user-facing error message without reflecting sensitive clinical notes or PHI.
 */
export function getKinesiologyErrorMessage(error: unknown): string {
  const normalized = normalizeKinesiologyError(error);

  if (normalized instanceof ValidationError) {
    if (normalized.details) {
      const messages = Object.values(normalized.details).flat();
      if (messages.length > 0) return messages.join('; ');
    }
    return normalized.message;
  }

  if (normalized instanceof AuthorizationError) {
    return 'You lack clinical permissions to perform this treatment action.';
  }

  if (normalized instanceof NotFoundError) {
    return normalized.message;
  }

  if (normalized instanceof KinesiologyRecordLockedError) {
    return 'This clinical record is finalized and cannot be modified.';
  }

  if (normalized instanceof KinesiologyDuplicateSessionError) {
    return 'A treatment session has already been created for this appointment.';
  }

  if (normalized instanceof KinesiologyConcurrencyError) {
    return 'The session was updated concurrently. Please refresh the page before saving changes.';
  }

  if (normalized instanceof KinesiologyStateTransitionError) {
    return normalized.message;
  }

  const rawMsg = normalized.message || '';
  const lowerMsg = rawMsg.toLowerCase();
  if (
    lowerMsg.includes('subjective') ||
    lowerMsg.includes('objective') ||
    lowerMsg.includes('assessment') ||
    lowerMsg.includes('plan') ||
    lowerMsg.includes('patient') ||
    lowerMsg.includes('pain') ||
    lowerMsg.includes('spine') ||
    normalized.statusCode >= 500 ||
    normalized.statusCode === 0
  ) {
    return 'An unexpected error occurred during treatment session processing.';
  }

  return rawMsg || 'An unexpected error occurred during treatment session processing.';
}

export {
  ApiError,
  ValidationError,
  ConflictError,
  NotFoundError,
  AuthorizationError,
  AuthenticationError,
  NetworkError,
};
