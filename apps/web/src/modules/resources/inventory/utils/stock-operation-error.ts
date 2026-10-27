import { ApiError } from '../../../../shared/api/api-error';

/**
 * Normalizes stock operation errors into business-friendly, actionable feedback.
 * Distinguishes insufficient stock, concurrency/OCC conflicts, authorization blocks,
 * invalid quantity/precision violations, and network transport interruptions.
 */
export function formatStockOperationError(
  error: unknown,
  defaultFallback = 'Failed to execute stock operation',
): string {
  if (!error) return defaultFallback;

  const rawMessage = error instanceof Error ? error.message : String(error);
  const lower = rawMessage.toLowerCase();

  // Network transport interruptions
  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('network request failed') ||
    lower.includes('offline')
  ) {
    return 'Network failure: Unable to reach the server. Your form entries have been preserved. Please check your connection and retry.';
  }

  // If error has specific detailed message from server or mock assertions, preserve it
  if (
    rawMessage &&
    (lower.includes('missing required') ||
      lower.includes('already processed') ||
      lower.includes('insufficient stock on hand') ||
      lower.includes('disposal quantity') ||
      lower.includes('discrepancy exceeds'))
  ) {
    return rawMessage;
  }

  // Authorization / permission issues
  if (
    (error instanceof ApiError && (error.statusCode === 403 || error.code === 'FORBIDDEN')) ||
    lower.includes('forbidden') ||
    lower.includes('unauthorized') ||
    lower.includes('403')
  ) {
    return rawMessage && lower.includes('claim')
      ? rawMessage
      : 'Permission denied: You do not possess the required inventory permissions (inventory.write) to perform this operation.';
  }

  // Concurrency / OCC conflicts
  if (
    (error instanceof ApiError && (error.statusCode === 409 || error.code === 'CONFLICT')) ||
    lower.includes('conflict') ||
    lower.includes('optimistic') ||
    lower.includes('concurrency') ||
    lower.includes('version mismatch')
  ) {
    return 'State conflict: Inventory data was modified concurrently by another user or session. Latest state has been refreshed.';
  }

  // Insufficient stock errors
  if (
    lower.includes('insufficient stock') ||
    lower.includes('insufficientstockexception') ||
    lower.includes('resulting quantity cannot be negative')
  ) {
    return rawMessage.length > 5
      ? rawMessage
      : 'Insufficient stock on hand to fulfill this operation. The available inventory balance has been refreshed.';
  }

  // Precision or invalid quantity violations
  if (
    lower.includes('invalid quantity') ||
    lower.includes('invalidquantityexception') ||
    lower.includes('decimal places')
  ) {
    return 'Invalid quantity: Stock operation requires a valid positive number with at most 2 decimal places.';
  }

  return rawMessage || defaultFallback;
}
