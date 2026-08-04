export abstract class AppError extends Error {
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

export class ValidationError extends AppError {
  readonly isRecoverable = true;
  constructor(
    message = 'Validation failed for request payload.',
    details?: Record<string, string[]>,
  ) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class AuthenticationError extends AppError {
  readonly isRecoverable = true;
  constructor(message = 'Session expired. Please log in again.') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class AuthorizationError extends AppError {
  readonly isRecoverable = false;
  constructor(message = 'You do not possess permission to perform this action.') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class NotFoundError extends AppError {
  readonly isRecoverable = false;
  constructor(message = 'The requested resource was not found.') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class ServerError extends AppError {
  readonly isRecoverable = true;
  constructor(message = 'An unexpected server error occurred.') {
    super(message, 500, 'INTERNAL_SERVER_ERROR');
  }
}

/**
 * Transforms raw HTTP or runtime errors into normalized AppError subclasses
 * matching NestJS ApiExceptionFilter contracts.
 */
export function normalizeQueryError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error && typeof error === 'object') {
    const errObj = error as {
      statusCode?: unknown;
      status?: unknown;
      message?: unknown;
      error?: unknown;
      details?: unknown;
    };

    const statusCode = Number(errObj.statusCode || errObj.status || 500);
    const message =
      typeof errObj.message === 'string' ? errObj.message : 'An unexpected error occurred.';
    const details = (errObj.details as Record<string, string[]>) || undefined;

    switch (statusCode) {
      case 400:
        return new ValidationError(message, details);
      case 401:
        return new AuthenticationError(message);
      case 403:
        return new AuthorizationError(message);
      case 404:
        return new NotFoundError(message);
      default:
        return new ServerError(message);
    }
  }

  return new ServerError(error instanceof Error ? error.message : 'Unknown network failure.');
}
