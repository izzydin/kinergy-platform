import { z } from 'zod';
import { ApiError, ConflictError, normalizeApiError } from '../../../../shared/api/api-error';

/**
 * Error raised when a backend response violates the expected contract schema.
 * Preserves safe diagnostic error paths while preventing leakage of full prompts or credentials.
 */
export class ContractValidationError extends ApiError {
  readonly isRecoverable = false;

  constructor(
    message = 'Backend API response contract validation failed.',
    public readonly validationIssues: readonly string[] = [],
    correlationId?: string,
  ) {
    super(message, 502, 'CONTRACT_VALIDATION_ERROR', undefined, correlationId);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Type guard for ConflictError.
 */
export function isConflictError(error: unknown): error is ConflictError {
  return error instanceof ConflictError || (error instanceof ApiError && error.statusCode === 409);
}

/**
 * Inspects whether a conflict error indicates an active generation turn is already in progress.
 * Identified by backend code 'TURN_ALREADY_IN_PROGRESS', 'AI_CONFLICT', or presence of Retry-After header.
 */
export function isTurnInProgressConflict(error: unknown): boolean {
  if (!isConflictError(error)) return false;

  const code =
    (error as { code?: string; responseData?: { code?: string } }).code ||
    (error as { responseData?: { code?: string } }).responseData?.code;
  const message = (error as Error).message?.toLowerCase() || '';
  const retryAfter = getRetryAfterSeconds(error);

  if (code === 'TURN_ALREADY_IN_PROGRESS') return true;
  if (retryAfter !== undefined && retryAfter > 0) return true;
  if (message.includes('already in progress') || message.includes('active generation')) return true;

  return false;
}

/**
 * Inspects whether a conflict error indicates a clientTurnId payload hash mismatch.
 */
export function isPayloadMismatchConflict(error: unknown): boolean {
  if (!isConflictError(error)) return false;

  const code =
    (error as { code?: string; responseData?: { code?: string } }).code ||
    (error as { responseData?: { code?: string } }).responseData?.code;
  const message = (error as Error).message?.toLowerCase() || '';

  if (code === 'DUPLICATE_CLIENT_TURN_PAYLOAD_MISMATCH') return true;
  if (message.includes('different payload') || message.includes('payload mismatch')) return true;

  return false;
}

/**
 * Extracts Retry-After recommendation seconds if returned by the server or error payload.
 */
export function getRetryAfterSeconds(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;

  const asAny = error as {
    retryAfterSeconds?: unknown;
    responseData?: { retryAfterSeconds?: unknown };
  };

  if (typeof asAny.retryAfterSeconds === 'number' && asAny.retryAfterSeconds > 0) {
    return asAny.retryAfterSeconds;
  }

  if (
    typeof asAny.responseData?.retryAfterSeconds === 'number' &&
    asAny.responseData.retryAfterSeconds > 0
  ) {
    return asAny.responseData.retryAfterSeconds;
  }

  return undefined;
}

/**
 * Centralized error normalization function for conversation persistence API interactions.
 * Translates Zod validation errors, network failures, and HTTP errors into typed ApiError instances.
 */
export function normalizeConversationApiError(error: unknown, context = 'API operation'): ApiError {
  if (error instanceof ContractValidationError) {
    return error;
  }

  if (error instanceof z.ZodError) {
    const issues = error.issues.map((i) => `${i.path.join('.') || 'root'}: ${i.message}`);
    return new ContractValidationError(
      `Response validation failed for ${context}: ${issues.slice(0, 3).join('; ')}`,
      issues,
    );
  }

  if (error instanceof ApiError) {
    return error;
  }

  return normalizeApiError(error);
}
