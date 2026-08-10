/**
 * Abstract base class for all application and API transport errors.
 */
export abstract class ApiError extends Error {
  abstract readonly isRecoverable: boolean;

  constructor(
    public override readonly message: string,
    public readonly statusCode: number,
    public readonly code: string,
    public readonly details?: Record<string, string[]>,
    public readonly correlationId?: string,
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Alias for backwards compatibility with query-error-normalizer */
export const AppError = ApiError;
export type AppError = ApiError;

export class ValidationError extends ApiError {
  readonly isRecoverable = true;
  constructor(
    message = 'Validation failed for request payload.',
    details?: Record<string, string[]>,
    correlationId?: string,
  ) {
    super(message, 400, 'VALIDATION_ERROR', details, correlationId);
  }
}

export class AuthenticationError extends ApiError {
  readonly isRecoverable = true; // Recoverable via login or RTR refresh token rotation
  constructor(message = 'Session expired. Please log in again.', correlationId?: string) {
    super(message, 401, 'UNAUTHORIZED', undefined, correlationId);
  }
}

export class AuthorizationError extends ApiError {
  readonly isRecoverable = false; // Flow-terminating: user lacks permission
  constructor(
    message = 'You do not possess permission to perform this action.',
    correlationId?: string,
  ) {
    super(message, 403, 'FORBIDDEN', undefined, correlationId);
  }
}

export class NotFoundError extends ApiError {
  readonly isRecoverable = false; // Resource does not exist
  constructor(message = 'The requested resource was not found.', correlationId?: string) {
    super(message, 404, 'NOT_FOUND', undefined, correlationId);
  }
}

export class ConflictError extends ApiError {
  readonly isRecoverable = true; // Resource conflict (e.g. duplicate key)
  constructor(message = 'A resource conflict occurred.', correlationId?: string) {
    super(message, 409, 'CONFLICT', undefined, correlationId);
  }
}

export class RateLimitError extends ApiError {
  readonly isRecoverable = true; // Retryable after rate limit window reset
  constructor(
    message = 'Too many requests. Please slow down and try again later.',
    public readonly retryAfterSeconds?: number,
    correlationId?: string,
  ) {
    super(message, 429, 'RATE_LIMITED', undefined, correlationId);
  }
}

export class ServerError extends ApiError {
  readonly isRecoverable = true;
  constructor(
    message = 'An unexpected server error occurred.',
    statusCode = 500,
    correlationId?: string,
  ) {
    super(message, statusCode, 'INTERNAL_SERVER_ERROR', undefined, correlationId);
  }
}

export class NetworkError extends ApiError {
  readonly isRecoverable = true;
  constructor(
    message = 'Network request failed. Please check your internet connection and try again.',
  ) {
    super(message, 0, 'NETWORK_ERROR');
  }
}

export class RequestCanceledError extends ApiError {
  readonly isRecoverable = true;
  constructor(message = 'The HTTP request was canceled by AbortSignal.') {
    super(message, 0, 'REQUEST_CANCELED');
  }
}

/**
 * Transforms raw HTTP payload objects, fetch errors, AbortSignals, or runtime objects into typed ApiError instances.
 */
export function normalizeApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  // Handle AbortSignal request cancellation
  if (
    error &&
    typeof error === 'object' &&
    'name' in error &&
    (error as { name?: string }).name === 'AbortError'
  ) {
    return new RequestCanceledError();
  }

  // Handle TypeError network failures (e.g., fetch failed, CORS error, device offline)
  if (
    error instanceof TypeError &&
    (error.message.includes('fetch') || error.message.includes('NetworkError'))
  ) {
    return new NetworkError(error.message);
  }

  if (error && typeof error === 'object') {
    const errObj = error as {
      statusCode?: unknown;
      status?: unknown;
      message?: unknown;
      error?: unknown;
      details?: unknown;
      correlationId?: unknown;
      retryAfterSeconds?: unknown;
    };

    const statusCode = Number(errObj.statusCode || errObj.status || 500);
    const message =
      typeof errObj.message === 'string' ? errObj.message : 'An unexpected error occurred.';
    const details = (errObj.details as Record<string, string[]>) || undefined;
    const correlationId =
      typeof errObj.correlationId === 'string' ? errObj.correlationId : undefined;

    switch (statusCode) {
      case 400:
        return new ValidationError(message, details, correlationId);
      case 401:
        return new AuthenticationError(message, correlationId);
      case 403:
        return new AuthorizationError(message, correlationId);
      case 404:
        return new NotFoundError(message, correlationId);
      case 409:
        return new ConflictError(message, correlationId);
      case 429:
        return new RateLimitError(
          message,
          typeof errObj.retryAfterSeconds === 'number' ? errObj.retryAfterSeconds : undefined,
          correlationId,
        );
      default:
        return new ServerError(message, statusCode, correlationId);
    }
  }

  return new ServerError(error instanceof Error ? error.message : 'Unknown transport failure.');
}

/** Alias for query-error-normalizer backwards compatibility */
export const normalizeQueryError = normalizeApiError;
