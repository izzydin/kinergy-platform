import type { TranslationParams } from './types';

export type TranslateFn = (
  key: string,
  fallbackOrParams?: string | TranslationParams,
  params?: TranslationParams,
) => string;

const ERROR_CODE_TO_KEY = {
  VALIDATION_ERROR: {
    key: 'errors.VALIDATION_ERROR',
    defaultEn: 'Please review the highlighted fields and correct any validation errors.',
  },
  BAD_REQUEST: {
    key: 'errors.BAD_REQUEST',
    defaultEn: 'The request could not be processed. Please verify the submitted information.',
  },
  UNAUTHORIZED: {
    key: 'errors.UNAUTHORIZED',
    defaultEn: 'Your session has expired or credentials are invalid. Please sign in again.',
  },
  INVALID_CREDENTIALS: {
    key: 'errors.INVALID_CREDENTIALS',
    defaultEn: 'Invalid email or password. Please verify your credentials and try again.',
  },
  FORBIDDEN: {
    key: 'errors.FORBIDDEN',
    defaultEn: 'Access denied. You do not have permission to perform this action.',
  },
  INSUFFICIENT_PERMISSIONS: {
    key: 'errors.FORBIDDEN',
    defaultEn: 'Access denied. You do not have permission to perform this action.',
  },
  NOT_FOUND: {
    key: 'errors.NOT_FOUND',
    defaultEn: 'The requested record or resource could not be found.',
  },
  CONFLICT: {
    key: 'errors.CONFLICT',
    defaultEn: 'This operation conflicts with an existing record or state.',
  },
  DUPLICATE_RECEIPT: {
    key: 'errors.DUPLICATE_RECEIPT',
    defaultEn: 'A primary receipt has already been issued for this sale.',
  },
  IDEMPOTENCY_CONFLICT: {
    key: 'errors.IDEMPOTENCY_CONFLICT',
    defaultEn: 'This transaction is already being processed or has already been completed.',
  },
  INSUFFICIENT_STOCK: {
    key: 'errors.INSUFFICIENT_STOCK',
    defaultEn: 'Insufficient inventory stock available to complete this request.',
  },
  SCHEDULING_CONFLICT: {
    key: 'errors.SCHEDULING_CONFLICT',
    defaultEn: 'The selected room, therapist, or time slot is already booked.',
  },
  RATE_LIMITED: {
    key: 'errors.RATE_LIMITED',
    defaultEn: 'Too many requests. Please wait a moment before trying again.',
  },
  NETWORK_ERROR: {
    key: 'errors.NETWORK_ERROR',
    defaultEn: 'Unable to reach the server. Please check your network connection.',
  },
  TIMEOUT_ERROR: {
    key: 'errors.TIMEOUT_ERROR',
    defaultEn: 'The server took too long to respond. Please try again.',
  },
  INTERNAL_SERVER_ERROR: {
    key: 'errors.INTERNAL_SERVER_ERROR',
    defaultEn: 'An unexpected server error occurred. Please try again shortly.',
  },
} as const;

type KnownErrorCode = keyof typeof ERROR_CODE_TO_KEY;

function getMappedErrorEntry(
  code: string,
): { readonly key: string; readonly defaultEn: string } | undefined {
  if (code in ERROR_CODE_TO_KEY) {
    return ERROR_CODE_TO_KEY[code as KnownErrorCode];
  }
  return undefined;
}

const STATUS_TO_CODE: Record<number, KnownErrorCode> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'VALIDATION_ERROR',
  429: 'RATE_LIMITED',
  500: 'INTERNAL_SERVER_ERROR',
  502: 'NETWORK_ERROR',
  503: 'NETWORK_ERROR',
  504: 'TIMEOUT_ERROR',
};

/**
 * Translates an `ApiError`, standard `Error`, plain error object, or error code string
 * into a localized, user-safe message without exposing internal stack traces.
 */
export function translateApiError(
  error: unknown,
  t: TranslateFn,
  fallbackMessage?: string,
): string {
  if (!error) {
    return (
      fallbackMessage ??
      t('errors.UNKNOWN_ERROR', 'An unexpected error occurred. Please try again.')
    );
  }

  if (typeof error === 'string') {
    const normalizedCode = error.trim().toUpperCase();
    const mapped = getMappedErrorEntry(normalizedCode);
    if (mapped) {
      return t(mapped.key, mapped.defaultEn);
    }
    return t(error, fallbackMessage ?? error);
  }

  if (typeof error === 'object') {
    const errRecord = error as {
      code?: unknown;
      status?: unknown;
      statusCode?: unknown;
      message?: unknown;
    };

    const rawCode = typeof errRecord.code === 'string' ? errRecord.code.trim().toUpperCase() : '';
    if (rawCode && rawCode !== 'API_ERROR' && rawCode !== 'HTTP_ERROR') {
      const mapped = getMappedErrorEntry(rawCode);
      if (mapped) {
        return t(mapped.key, mapped.defaultEn);
      }
    }

    const rawMessage = typeof errRecord.message === 'string' ? errRecord.message : '';
    if (rawMessage) {
      const normalizedMsg = rawMessage.trim().toUpperCase();
      const mappedMsg = getMappedErrorEntry(normalizedMsg);
      if (mappedMsg) {
        return t(mappedMsg.key, mappedMsg.defaultEn);
      }

      if (/duplicate receipt|already exists for sale/i.test(rawMessage)) {
        const dup = ERROR_CODE_TO_KEY.DUPLICATE_RECEIPT;
        return t(dup.key, dup.defaultEn);
      }

      if (/invalid credentials|invalid email or password/i.test(rawMessage)) {
        const cred = ERROR_CODE_TO_KEY.INVALID_CREDENTIALS;
        return t(cred.key, cred.defaultEn);
      }

      if (/network|failed to fetch/i.test(rawMessage)) {
        const net = ERROR_CODE_TO_KEY.NETWORK_ERROR;
        return t(net.key, net.defaultEn);
      }
    }

    const numericStatus =
      typeof errRecord.status === 'number'
        ? errRecord.status
        : typeof errRecord.statusCode === 'number'
          ? errRecord.statusCode
          : undefined;

    if (numericStatus !== undefined) {
      const statusCodeKey = STATUS_TO_CODE[numericStatus];
      if (statusCodeKey) {
        const mapped = ERROR_CODE_TO_KEY[statusCodeKey];
        return t(mapped.key, mapped.defaultEn);
      }
    }

    if (rawMessage && !rawMessage.includes('\n    at ') && rawMessage.trim().length > 0) {
      return t(rawMessage, rawMessage);
    }
  }

  return (
    fallbackMessage ?? t('errors.UNKNOWN_ERROR', 'An unexpected error occurred. Please try again.')
  );
}
