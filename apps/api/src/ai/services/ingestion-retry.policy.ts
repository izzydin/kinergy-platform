import {
  InvalidFormatExtractionException,
  UnsupportedDocumentFeatureException,
  CorruptDocumentExtractionException,
  EmptyExtractedDocumentException,
  ExtractionTimeoutException,
  ExtractionResourceLimitExceededException,
  DocumentValidationException,
} from '@kinergy-platform/core';

/**
 * Ingestion Error Code taxonomy.
 * Categorizes operational errors into retryable (transient) and non-retryable (permanent).
 */
export enum IngestionErrorCode {
  // --- Transient (Retryable) Errors ---
  STORAGE_TIMEOUT = 'STORAGE_TIMEOUT',
  STORAGE_UNAVAILABLE = 'STORAGE_UNAVAILABLE',
  DATABASE_TRANSIENT_ERROR = 'DATABASE_TRANSIENT_ERROR',
  PROCESSING_TIMEOUT = 'PROCESSING_TIMEOUT',
  NETWORK_TRANSIENT_ERROR = 'NETWORK_TRANSIENT_ERROR',
  RATE_LIMITED = 'RATE_LIMITED',
  WORKER_CRASH_RECOVERED = 'WORKER_CRASH_RECOVERED',

  // --- Permanent (Non-Retryable) Errors ---
  DOCUMENT_NOT_FOUND = 'DOCUMENT_NOT_FOUND',
  DOCUMENT_VERSION_NOT_FOUND = 'DOCUMENT_VERSION_NOT_FOUND',
  STORAGE_OBJECT_MISSING = 'STORAGE_OBJECT_MISSING',
  CHECKSUM_MISMATCH = 'CHECKSUM_MISMATCH',
  UNSUPPORTED_FORMAT = 'UNSUPPORTED_FORMAT',
  MALFORMED_CONTENT = 'MALFORMED_CONTENT',
  SECURITY_VIOLATION = 'SECURITY_VIOLATION',
  CANCELLED_BY_USER = 'CANCELLED_BY_USER',
  MAX_ATTEMPTS_EXCEEDED = 'MAX_ATTEMPTS_EXCEEDED',
  INDEXING_PERMANENT_ERROR = 'INDEXING_PERMANENT_ERROR',
  UNKNOWN_NON_RETRYABLE = 'UNKNOWN_NON_RETRYABLE',
}

export interface IngestionErrorClassification {
  code: IngestionErrorCode;
  isRetryable: boolean;
  message: string;
}

export interface RetryPolicyOptions {
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterFactor?: number;
}

export const DEFAULT_RETRY_POLICY = {
  maxAttempts: 3,
  baseDelayMs: 5_000, // 5 seconds
  maxDelayMs: 300_000, // 5 minutes
  jitterFactor: 0.2, // up to 20% random jitter
} as const;

/**
 * Ingestion Retry Policy.
 * Implements exponential backoff with full jitter and deterministic error classification.
 */
export class IngestionRetryPolicy {
  private static readonly RETRYABLE_CODES = new Set<IngestionErrorCode>([
    IngestionErrorCode.STORAGE_TIMEOUT,
    IngestionErrorCode.STORAGE_UNAVAILABLE,
    IngestionErrorCode.DATABASE_TRANSIENT_ERROR,
    IngestionErrorCode.PROCESSING_TIMEOUT,
    IngestionErrorCode.NETWORK_TRANSIENT_ERROR,
    IngestionErrorCode.RATE_LIMITED,
    IngestionErrorCode.WORKER_CRASH_RECOVERED,
  ]);

  /**
   * Evaluates whether an error code qualifies for retry.
   */
  public static isRetryable(code: IngestionErrorCode | string): boolean {
    return this.RETRYABLE_CODES.has(code as IngestionErrorCode);
  }

  /**
   * Classifies an unhandled exception or error into an IngestionErrorClassification.
   */
  public static classifyError(error: unknown): IngestionErrorClassification {
    if (!error) {
      return {
        code: IngestionErrorCode.UNKNOWN_NON_RETRYABLE,
        isRetryable: false,
        message: 'Unknown error occurred with no diagnostic information.',
      };
    }

    const message = error instanceof Error ? error.message : String(error);
    const lowerMessage = message.toLowerCase();

    // 0. Explicit Domain Extraction & Processing Exceptions
    if (error instanceof ExtractionTimeoutException) {
      return {
        code: IngestionErrorCode.PROCESSING_TIMEOUT,
        isRetryable: true,
        message: error.message,
      };
    }

    if (
      error instanceof InvalidFormatExtractionException ||
      error instanceof UnsupportedDocumentFeatureException
    ) {
      return {
        code: IngestionErrorCode.UNSUPPORTED_FORMAT,
        isRetryable: false,
        message: error.message,
      };
    }

    if (
      error instanceof CorruptDocumentExtractionException ||
      error instanceof EmptyExtractedDocumentException ||
      error instanceof ExtractionResourceLimitExceededException ||
      error instanceof DocumentValidationException
    ) {
      return {
        code: IngestionErrorCode.MALFORMED_CONTENT,
        isRetryable: false,
        message: error.message,
      };
    }

    // 1. Explicit cancellation
    if (lowerMessage.includes('cancel') || lowerMessage.includes('cancellation')) {
      return {
        code: IngestionErrorCode.CANCELLED_BY_USER,
        isRetryable: false,
        message: 'Operation was cancelled.',
      };
    }

    // 2. Storage timeouts & connection errors
    if (
      lowerMessage.includes('timeout') ||
      lowerMessage.includes('etimedout') ||
      lowerMessage.includes('esockettimedout')
    ) {
      return {
        code: IngestionErrorCode.STORAGE_TIMEOUT,
        isRetryable: true,
        message: 'Storage or processing connection timed out.',
      };
    }

    if (
      lowerMessage.includes('503') ||
      lowerMessage.includes('service unavailable') ||
      lowerMessage.includes('slowdown')
    ) {
      return {
        code: IngestionErrorCode.STORAGE_UNAVAILABLE,
        isRetryable: true,
        message: 'Storage service temporarily unavailable or throttled.',
      };
    }

    if (
      lowerMessage.includes('econnreset') ||
      lowerMessage.includes('econnrefused') ||
      lowerMessage.includes('network')
    ) {
      return {
        code: IngestionErrorCode.NETWORK_TRANSIENT_ERROR,
        isRetryable: true,
        message: 'Transient network failure during ingestion pipeline.',
      };
    }

    // 3. Database transient errors (deadlocks, pool timeouts)
    if (
      lowerMessage.includes('deadlock') ||
      lowerMessage.includes('p2034') ||
      lowerMessage.includes('connection pool')
    ) {
      return {
        code: IngestionErrorCode.DATABASE_TRANSIENT_ERROR,
        isRetryable: true,
        message: 'Database concurrency deadlock or transient pool exhaustion.',
      };
    }

    // 4. Missing resources (permanent)
    if (
      lowerMessage.includes('not found') ||
      lowerMessage.includes('does not exist') ||
      lowerMessage.includes('nosuchkey') ||
      lowerMessage.includes('404')
    ) {
      if (lowerMessage.includes('document') || lowerMessage.includes('version')) {
        return {
          code: IngestionErrorCode.DOCUMENT_NOT_FOUND,
          isRetryable: false,
          message: 'Referenced document or document version does not exist.',
        };
      }
      return {
        code: IngestionErrorCode.STORAGE_OBJECT_MISSING,
        isRetryable: false,
        message: 'Physical object was not found in storage repository.',
      };
    }

    // 5. Checksum / integrity mismatch (permanent)
    if (lowerMessage.includes('checksum') || lowerMessage.includes('hash mismatch')) {
      return {
        code: IngestionErrorCode.CHECKSUM_MISMATCH,
        isRetryable: false,
        message: 'Document checksum validation failed against stored object.',
      };
    }

    // 6. Security & format violations (permanent)
    if (
      lowerMessage.includes('malicious') ||
      lowerMessage.includes('prohibited') ||
      lowerMessage.includes('zip bomb') ||
      lowerMessage.includes('security')
    ) {
      return {
        code: IngestionErrorCode.SECURITY_VIOLATION,
        isRetryable: false,
        message: 'Document content violated security validation policies.',
      };
    }

    if (
      lowerMessage.includes('unsupported') ||
      lowerMessage.includes('mime') ||
      lowerMessage.includes('corrupted') ||
      lowerMessage.includes('malformed')
    ) {
      return {
        code: IngestionErrorCode.MALFORMED_CONTENT,
        isRetryable: false,
        message: 'Document content is malformed or in an unsupported format.',
      };
    }

    // 7. Default to non-retryable to prevent infinite loops on unclassified logic bugs
    return {
      code: IngestionErrorCode.UNKNOWN_NON_RETRYABLE,
      isRetryable: false,
      message: message.substring(0, 300),
    };
  }

  /**
   * Computes the scheduled retry timestamp using exponential backoff with jitter.
   *
   * Formula:
   *   Delay = min(BaseDelay * 2^(attemptCount - 1) * (1 + JitterFactor * rand()), MaxDelay)
   *
   * @param attemptCount Current attempt number (1-based)
   * @param options Configuration for base, max delay, and jitter
   * @param rng Optional RNG provider for deterministic unit testing
   */
  public static computeNextRetryAt(
    attemptCount: number,
    options: RetryPolicyOptions = {},
    rng: () => number = Math.random,
  ): Date {
    const baseDelay = options.baseDelayMs ?? DEFAULT_RETRY_POLICY.baseDelayMs;
    const maxDelay = options.maxDelayMs ?? DEFAULT_RETRY_POLICY.maxDelayMs;
    const jitterFactor = options.jitterFactor ?? DEFAULT_RETRY_POLICY.jitterFactor;

    const exponent = Math.max(0, attemptCount - 1);
    const exponentialDelay = baseDelay * Math.pow(2, exponent);
    const jitter = exponentialDelay * jitterFactor * rng();
    const totalDelay = Math.min(exponentialDelay + jitter, maxDelay);

    return new Date(Date.now() + Math.round(totalDelay));
  }
}
