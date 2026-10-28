/**
 * Financial & Commercial Sales Error Translator
 * Scope: Sales & Payments Domain (`modules/sales`)
 *
 * Translates backend domain invariants, RFC HTTP status codes, and network exceptions
 * into truthful, actionable, non-leaking business language.
 *
 * Conforms to:
 * - Enterprise Exception Standard (SalesExceptionFilter)
 * - RFC 7807 problem details
 * - Information Security Policy (no stack traces, internal table names, or credentials)
 */

export type SalesErrorCategory =
  | 'VALIDATION'
  | 'SOURCE_INELIGIBLE'
  | 'AMOUNT_INVALID'
  | 'PAYMENT_FAILED'
  | 'CONFLICT'
  | 'CANCELLATION_REJECTED'
  | 'RECEIPT_INELIGIBLE'
  | 'PERMISSION_DENIED'
  | 'NETWORK_AMBIGUOUS'
  | 'SERVER_ERROR';

export interface TranslatedSalesError {
  /** High-level operational category */
  readonly category: SalesErrorCategory;
  /** Primary human-readable title */
  readonly title: string;
  /** Clear, actionable business explanation */
  readonly message: string;
  /** Suggested next action for the user */
  readonly actionHint?: string;
  /** HTTP status code if known */
  readonly statusCode?: number;
  /** Whether the operation outcome is ambiguous (e.g. network failure) */
  readonly isAmbiguous: boolean;
  /** Whether the error is a concurrency collision or duplicate */
  readonly isConflict: boolean;
}

/**
 * Normalizes and translates raw API/network errors into structured, user-facing error models.
 */
export function translateSalesError(error: unknown): TranslatedSalesError {
  if (!error) {
    return {
      category: 'SERVER_ERROR',
      title: 'Unexpected Error',
      message: 'An unknown error occurred while processing the commercial transaction.',
      actionHint: 'Please refresh the page and verify the current transaction state.',
      isAmbiguous: false,
      isConflict: false,
    };
  }

  const errObj = error as Record<string, unknown>;
  const response = errObj?.response as Record<string, unknown> | undefined;
  const responseData = (response?.data ?? errObj?.data) as Record<string, unknown> | undefined;

  const rawStatusCode =
    (errObj?.statusCode as number | undefined) ??
    (errObj?.status as number | undefined) ??
    (response?.status as number | undefined) ??
    (responseData?.statusCode as number | undefined);

  const statusCode =
    typeof rawStatusCode === 'number' && !isNaN(rawStatusCode) ? rawStatusCode : undefined;

  const rawMsg =
    responseData?.message ??
    errObj?.message ??
    response?.statusText ??
    'Transaction request could not be processed.';

  const rawCode = String(responseData?.code ?? errObj?.code ?? '');
  const rawMessage = Array.isArray(rawMsg) ? rawMsg.join(', ') : String(rawMsg);
  const normalizedLower = (rawMessage + ' ' + rawCode).toLowerCase();

  // 1. Network Failure / Ambiguous Outcome (status 0, TypeError, fetch failed, timeout)
  const isNetworkFailure =
    !statusCode ||
    statusCode === 0 ||
    normalizedLower.includes('network') ||
    normalizedLower.includes('fetch') ||
    normalizedLower.includes('timeout') ||
    normalizedLower.includes('connection refused') ||
    normalizedLower.includes('offline');

  if (isNetworkFailure) {
    return {
      category: 'NETWORK_AMBIGUOUS',
      title: 'Ambiguous Network Outcome',
      message:
        'A network interruption occurred before receiving server confirmation. Because the server may have already processed this transaction, please inspect the current status in the sales ledger before attempting to resubmit.',
      actionHint: 'Check the Sales Directory or Payments Log before re-initiating.',
      statusCode: 0,
      isAmbiguous: true,
      isConflict: false,
    };
  }

  // 2. Security & Permission Denial (403 Forbidden)
  if (
    statusCode === 403 ||
    normalizedLower.includes('forbidden') ||
    normalizedLower.includes('unauthorized') ||
    normalizedLower.includes('permission') ||
    rawCode.includes('UNAUTHORIZED')
  ) {
    return {
      category: 'PERMISSION_DENIED',
      title: 'Action Prohibited (Permission Denied)',
      message:
        'Your user account lacks the required authorization claim to execute this commercial operation. Only authorized personnel can perform this action.',
      actionHint: 'Contact your workspace administrator to request access.',
      statusCode: 403,
      isAmbiguous: false,
      isConflict: false,
    };
  }

  // 3. Concurrency Conflict / Duplicate Operation (409 Conflict)
  const isConflict =
    statusCode === 409 ||
    rawCode === 'CONFLICT' ||
    rawCode === 'DUPLICATE_SALE' ||
    rawCode === 'DUPLICATE_PAYMENT_REFERENCE' ||
    rawCode === 'DUPLICATE_RECEIPT' ||
    normalizedLower.includes('duplicate') ||
    normalizedLower.includes('already exists') ||
    normalizedLower.includes('conflict') ||
    normalizedLower.includes('concurrency') ||
    normalizedLower.includes('optimistic') ||
    normalizedLower.includes('modified concurrently');

  if (isConflict) {
    return {
      category: 'CONFLICT',
      title: 'Duplicate or Concurrency Collision',
      message:
        'A concurrency conflict occurred. This commercial agreement or tender record may have already been updated by another user or session.',
      actionHint: 'Refresh the record to inspect the latest authoritative state.',
      statusCode: 409,
      isAmbiguous: false,
      isConflict: true,
    };
  }

  // 4. Overpayment / Insufficient / Currency Amount Errors
  if (
    rawCode === 'PAYMENT_OVERPAYMENT' ||
    rawCode === 'PAYMENT_CURRENCY_MISMATCH' ||
    rawCode === 'INVALID_MONEY' ||
    normalizedLower.includes('overpayment') ||
    normalizedLower.includes('exceeds remaining balance') ||
    normalizedLower.includes('currency mismatch') ||
    normalizedLower.includes('zero is not allowed') ||
    normalizedLower.includes('negative money')
  ) {
    return {
      category: 'AMOUNT_INVALID',
      title: 'Invalid Payment Tender Amount',
      message: sanitizeDomainMessage(
        rawMessage,
        'The tender amount is invalid or exceeds the authoritative remaining balance.',
      ),
      actionHint: 'Verify the outstanding balance and adjust the tender amount.',
      statusCode: statusCode ?? 422,
      isAmbiguous: false,
      isConflict: false,
    };
  }

  // 5. Source Ineligibility (e.g. appointment already billed, membership inactive)
  if (
    normalizedLower.includes('source') ||
    normalizedLower.includes('not eligible') ||
    normalizedLower.includes('already billed') ||
    normalizedLower.includes('already consumed') ||
    normalizedLower.includes('unsupported source')
  ) {
    return {
      category: 'SOURCE_INELIGIBLE',
      title: 'Commercial Source Ineligible',
      message: sanitizeDomainMessage(
        rawMessage,
        'The selected origin entity is not eligible to enter commercial checkout.',
      ),
      actionHint: 'Ensure the source entity is in an eligible lifecycle state.',
      statusCode: statusCode ?? 422,
      isAmbiguous: false,
      isConflict: false,
    };
  }

  // 6. Cancellation Invariant Rejections (422)
  if (
    normalizedLower.includes('cannot cancel') ||
    normalizedLower.includes('cannot be cancelled') ||
    normalizedLower.includes('already settled') ||
    normalizedLower.includes('already cancelled') ||
    (statusCode === 422 && normalizedLower.includes('cancellation'))
  ) {
    return {
      category: 'CANCELLATION_REJECTED',
      title: 'Cancellation Rejected by Domain Rules',
      message: sanitizeDomainMessage(
        rawMessage,
        'This commercial agreement cannot be cancelled in its current lifecycle status.',
      ),
      actionHint: 'Inspect the sale details to review current status and settlement history.',
      statusCode: statusCode ?? 422,
      isAmbiguous: false,
      isConflict: false,
    };
  }

  // 7. Receipt Ineligibility (422 / 404)
  if (
    rawCode === 'RECEIPT_ISSUANCE_REJECTED' ||
    normalizedLower.includes('receipt') ||
    normalizedLower.includes('zero remaining balance') ||
    normalizedLower.includes('not paid or completed')
  ) {
    return {
      category: 'RECEIPT_INELIGIBLE',
      title: 'Receipt Ineligible for Agreement',
      message: sanitizeDomainMessage(
        rawMessage,
        'Official receipts can only be generated after an agreement is fully settled (zero remaining balance).',
      ),
      actionHint:
        'Ensure all tenders are completed and balance is zero before requesting receipts.',
      statusCode: statusCode ?? 422,
      isAmbiguous: false,
      isConflict: false,
    };
  }

  // 8. Payment Tender Failures
  if (
    rawCode.startsWith('PAYMENT_') ||
    rawCode.startsWith('INVALID_PAYMENT_') ||
    normalizedLower.includes('payment') ||
    normalizedLower.includes('tender')
  ) {
    return {
      category: 'PAYMENT_FAILED',
      title: 'Payment Tender Processing Failed',
      message: sanitizeDomainMessage(
        rawMessage,
        'The requested payment tender could not be processed.',
      ),
      actionHint: 'Verify tender rail details and customer reference before retrying.',
      statusCode: statusCode ?? 400,
      isAmbiguous: false,
      isConflict: false,
    };
  }

  // 9. Validation Errors (400 Bad Request)
  if (
    statusCode === 400 ||
    rawCode === 'VALIDATION_ERROR' ||
    normalizedLower.includes('validation')
  ) {
    return {
      category: 'VALIDATION',
      title: 'Validation Error',
      message: sanitizeDomainMessage(
        rawMessage,
        'One or more fields in the submitted request are invalid.',
      ),
      actionHint: 'Review form errors and verify all required line items and totals.',
      statusCode: 400,
      isAmbiguous: false,
      isConflict: false,
    };
  }

  // 10. Default Server Error (500)
  return {
    category: 'SERVER_ERROR',
    title: 'Server Error',
    message: sanitizeDomainMessage(
      rawMessage,
      'An internal error occurred while processing the request.',
    ),
    actionHint: 'If the issue persists, contact technical support.',
    statusCode: statusCode ?? 500,
    isAmbiguous: false,
    isConflict: false,
  };
}

/**
 * Strips database column names, Prisma/PostgreSQL patterns, and internal stack keywords.
 */
function sanitizeDomainMessage(raw: string, fallback: string): string {
  if (!raw || typeof raw !== 'string') return fallback;

  // Protect against leaking internal SQL, Prisma, or stack details
  const lower = raw.toLowerCase();
  if (
    lower.includes('prisma') ||
    lower.includes('select ') ||
    lower.includes('insert into') ||
    lower.includes('foreign key') ||
    lower.includes('null constraint') ||
    lower.includes('stack trace') ||
    lower.includes('at node:') ||
    lower.includes('syntaxerror')
  ) {
    return fallback;
  }

  return raw;
}
