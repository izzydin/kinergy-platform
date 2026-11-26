/**
 * Central Error Recovery Policy Matrix (ER.09)
 *
 * Establishes typed, semantic recovery classifications for all operations across
 * Kynergy Intelligence. Governs automatic retry eligibility, backoff formulas,
 * idempotency safeguards, reconciliation triggers, and user recovery actions.
 */

import {
  ApiError,
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  NetworkError,
  NotFoundError,
  RateLimitError,
  ServerError,
  ValidationError,
  normalizeApiError,
} from '../../../../shared/api/api-error';

export type RecoveryDisposition =
  | 'SAFE_AUTOMATIC_RETRY' // Transient failure, safe to retry with bounded backoff
  | 'SAFE_USER_INITIATED_RETRY' // Action failed, safe for user to retry via button/action
  | 'RETRY_ONLY_AFTER_RECONCILE' // State uncertain (e.g. timeout on turn reservation/upload >=95%)
  | 'RETRY_NOT_SUPPORTED' // Terminal unrecoverable error (e.g. invalid format, bad request)
  | 'REQUIRES_AUTHENTICATION' // Session expired, 401 unauthenticated
  | 'REQUIRES_PERMISSION' // 403 Forbidden, user lacks required role/facility clearance
  | 'REQUIRES_DIFFERENT_ACTION'; // Conflict, rate limited with wait, quota exceeded

export type OperationCategory =
  | 'QUERY_CONVERSATION_LIST'
  | 'QUERY_MESSAGE_HISTORY'
  | 'QUERY_DOCUMENT_LIST'
  | 'QUERY_DOCUMENT_DETAIL'
  | 'QUERY_INGESTION_STATUS'
  | 'MUTATION_CREATE_CONVERSATION'
  | 'MUTATION_RESERVE_TURN'
  | 'MUTATION_SUBMIT_MESSAGE'
  | 'MUTATION_CANCEL_TURN'
  | 'MUTATION_RETRY_INGESTION'
  | 'MUTATION_CANCEL_INGESTION'
  | 'UPLOAD_DOCUMENT'
  | 'PREVIEW_DOCUMENT';

export interface RecoveryActionDescriptor {
  readonly disposition: RecoveryDisposition;
  readonly canAutoRetry: boolean;
  readonly canUserRetry: boolean;
  readonly requiresReconciliation: boolean;
  readonly maxAutoRetries: number;
  readonly backoffDelayMs: number;
  readonly userMessage: string;
  readonly primaryActionLabel?: string;
  readonly secondaryActionLabel?: string;
}

export interface EvaluateRecoveryOptions {
  readonly operation: OperationCategory;
  readonly error: unknown;
  readonly attemptCount?: number;
  readonly uploadPercentage?: number;
  readonly isIdempotent?: boolean;
}

/**
 * Calculates exponential backoff delay with full jitter.
 * Formula: min(maxDelayMs, baseDelayMs * 2^attempt) * random(0.8, 1.2)
 */
export function calculateBackoffWithJitter(
  attempt: number,
  baseDelayMs = 1000,
  maxDelayMs = 15000,
): number {
  const exponential = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt));
  const jitterFactor = 0.8 + Math.random() * 0.4; // 80% to 120%
  return Math.round(exponential * jitterFactor);
}

/**
 * Evaluates the authoritative recovery disposition for an operation and error.
 */
export function evaluateRecoveryPolicy(options: EvaluateRecoveryOptions): RecoveryActionDescriptor {
  const { operation, error, attemptCount = 0, uploadPercentage = 0 } = options;
  const apiError = error instanceof ApiError ? error : normalizeApiError(error);
  const status = apiError.statusCode;

  // ─── 1. Authentication & Authorization Failures ────────────────────────────
  if (apiError instanceof AuthenticationError || status === 401) {
    return {
      disposition: 'REQUIRES_AUTHENTICATION',
      canAutoRetry: false,
      canUserRetry: false,
      requiresReconciliation: false,
      maxAutoRetries: 0,
      backoffDelayMs: 0,
      userMessage: 'Tu sesión ha expirado o no es válida. Inicia sesión nuevamente.',
      primaryActionLabel: 'Iniciar sesión',
    };
  }

  if (apiError instanceof AuthorizationError || status === 403) {
    return {
      disposition: 'REQUIRES_PERMISSION',
      canAutoRetry: false,
      canUserRetry: false,
      requiresReconciliation: false,
      maxAutoRetries: 0,
      backoffDelayMs: 0,
      userMessage: 'No cuentas con los permisos requeridos para acceder a este recurso clínico.',
      primaryActionLabel: 'Volver',
    };
  }

  // ─── 2. Validation & Unrecoverable Client Errors ───────────────────────────
  if (apiError instanceof ValidationError || status === 400 || status === 422) {
    return {
      disposition: 'RETRY_NOT_SUPPORTED',
      canAutoRetry: false,
      canUserRetry: false,
      requiresReconciliation: false,
      maxAutoRetries: 0,
      backoffDelayMs: 0,
      userMessage: apiError.message || 'La solicitud contiene parámetros inválidos.',
      primaryActionLabel: 'Revisar datos',
    };
  }

  // ─── 3. Rate Limiting (429) ───────────────────────────────────────────────
  if (apiError instanceof RateLimitError || status === 429) {
    const retryAfter = (apiError as RateLimitError).retryAfterSeconds ?? 10;
    return {
      disposition: 'REQUIRES_DIFFERENT_ACTION',
      canAutoRetry: false,
      canUserRetry: true,
      requiresReconciliation: false,
      maxAutoRetries: 0,
      backoffDelayMs: retryAfter * 1000,
      userMessage: `Límite de solicitudes alcanzado. Por favor, espera ${retryAfter} segundos antes de intentar nuevamente.`,
      primaryActionLabel: 'Reintentar tras espera',
    };
  }

  // ─── 4. Resource Conflict (409) ───────────────────────────────────────────
  if (apiError instanceof ConflictError || status === 409) {
    return {
      disposition: 'REQUIRES_DIFFERENT_ACTION',
      canAutoRetry: false,
      canUserRetry: false,
      requiresReconciliation: false,
      maxAutoRetries: 0,
      backoffDelayMs: 0,
      userMessage: apiError.message || 'El recurso ya existe o fue modificado concurrentemente.',
      primaryActionLabel: 'Actualizar vista',
    };
  }

  // ─── 5. Resource Not Found (404) ──────────────────────────────────────────
  if (apiError instanceof NotFoundError || status === 404) {
    return {
      disposition: 'RETRY_NOT_SUPPORTED',
      canAutoRetry: false,
      canUserRetry: false,
      requiresReconciliation: false,
      maxAutoRetries: 0,
      backoffDelayMs: 0,
      userMessage: 'El recurso solicitado no fue encontrado o ha sido eliminado.',
      primaryActionLabel: 'Aceptar',
    };
  }

  // ─── 6. Late Network Dropping during File Upload (>= 95%) ─────────────────
  if (operation === 'UPLOAD_DOCUMENT' && uploadPercentage >= 95) {
    return {
      disposition: 'RETRY_ONLY_AFTER_RECONCILE',
      canAutoRetry: false,
      canUserRetry: false,
      requiresReconciliation: true,
      maxAutoRetries: 0,
      backoffDelayMs: 0,
      userMessage:
        'La transferencia del archivo finalizó en el navegador, pero no se confirmó su almacenamiento en el servidor. Verifica en la lista si el documento se creó antes de reintentar para evitar duplicados.',
      primaryActionLabel: 'Verificar estado',
      secondaryActionLabel: 'Subir nuevamente',
    };
  }

  // ─── 7. Turn Reservation & Message Submission In-Flight Interruption ──────
  if (
    (operation === 'MUTATION_RESERVE_TURN' ||
      operation === 'MUTATION_CREATE_CONVERSATION' ||
      operation === 'MUTATION_SUBMIT_MESSAGE') &&
    (status === 408 ||
      status === 504 ||
      apiError.code === 'NETWORK_ERROR' ||
      apiError.code === 'TIMEOUT')
  ) {
    return {
      disposition: 'RETRY_ONLY_AFTER_RECONCILE',
      canAutoRetry: false,
      canUserRetry: false,
      requiresReconciliation: true,
      maxAutoRetries: 0,
      backoffDelayMs: 0,
      userMessage:
        'No se recibió confirmación de persistencia del mensaje. Reconciliando con el historial del servidor antes de reintentar.',
      primaryActionLabel: 'Reconciliar estado',
      secondaryActionLabel: 'Editar mensaje',
    };
  }

  // ─── 8. Safe Read Queries (Automatic Transient Retries) ───────────────────
  const isReadQuery = operation.startsWith('QUERY_') || operation === 'PREVIEW_DOCUMENT';

  const isTransient =
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    apiError.code === 'NETWORK_ERROR' ||
    apiError.code === 'TIMEOUT' ||
    apiError instanceof NetworkError ||
    apiError instanceof ServerError;

  if (isReadQuery && isTransient) {
    const maxRetries = 3;
    if (attemptCount < maxRetries) {
      return {
        disposition: 'SAFE_AUTOMATIC_RETRY',
        canAutoRetry: true,
        canUserRetry: true,
        requiresReconciliation: false,
        maxAutoRetries: maxRetries,
        backoffDelayMs: calculateBackoffWithJitter(attemptCount),
        userMessage: 'Fallo transitorio de conexión. Reintentando automáticamente...',
        primaryActionLabel: 'Reintentar ahora',
      };
    }

    return {
      disposition: 'SAFE_USER_INITIATED_RETRY',
      canAutoRetry: false,
      canUserRetry: true,
      requiresReconciliation: false,
      maxAutoRetries: maxRetries,
      backoffDelayMs: 0,
      userMessage:
        'No se pudo obtener la información después de varios intentos. Comprueba tu conexión.',
      primaryActionLabel: 'Reintentar',
    };
  }

  // ─── 9. Idempotent Ingestion Retries ───────────────────────────────────────
  if (operation === 'MUTATION_RETRY_INGESTION' && isTransient) {
    return {
      disposition: 'SAFE_USER_INITIATED_RETRY',
      canAutoRetry: false,
      canUserRetry: true,
      requiresReconciliation: false,
      maxAutoRetries: 0,
      backoffDelayMs: 0,
      userMessage:
        'Error de comunicación al solicitar reintento de indexación. Puedes intentarlo de nuevo.',
      primaryActionLabel: 'Reintentar indexación',
    };
  }

  // ─── 10. Default Fallback for Mutations & Complex Operations ──────────────
  return {
    disposition: 'SAFE_USER_INITIATED_RETRY',
    canAutoRetry: false,
    canUserRetry: true,
    requiresReconciliation: false,
    maxAutoRetries: 0,
    backoffDelayMs: 0,
    userMessage: 'Ocurrió un error inesperado al procesar la solicitud.',
    primaryActionLabel: 'Reintentar',
  };
}
