import { formatStockOperationError } from '../stock-operation-error';
import {
  AuthorizationError,
  ConflictError,
  NetworkError,
} from '../../../../../shared/api/api-error';

describe('formatStockOperationError Utility', () => {
  it('maps AuthorizationError (403) to clear permission guidance', () => {
    const error = new AuthorizationError('User lacks inventory.write permission');
    expect(formatStockOperationError(error)).toBe(
      'Permission denied: You do not possess the required inventory permissions (inventory.write) to perform this operation.',
    );
  });

  it('maps ConflictError (409) to concurrency / OCC explanation', () => {
    const error = new ConflictError(
      'State conflict: Inventory data was modified concurrently by another user or session. Latest state has been refreshed.',
    );
    expect(formatStockOperationError(error)).toContain('State conflict');
  });

  it('maps NetworkError to connectivity and form preservation feedback', () => {
    const error = new NetworkError('Failed to fetch resource');
    expect(formatStockOperationError(error)).toBe(
      'Network failure: Unable to reach the server. Your form entries have been preserved. Please check your connection and retry.',
    );
  });

  it('explains insufficient stock rejection clearly', () => {
    const error = new Error('Insufficient stock on hand to fulfill requested operation');
    expect(formatStockOperationError(error)).toContain('Insufficient stock on hand');
  });

  it('explains invalid quantity or decimal precision violations', () => {
    const error = new Error('InvalidQuantityException: Quantity cannot exceed 2 decimal places');
    expect(formatStockOperationError(error)).toBe(
      'Invalid quantity: Stock operation requires a valid positive number with at most 2 decimal places.',
    );
  });

  it('preserves specific business validation messages', () => {
    const error = new Error('Invoice reference number already processed');
    expect(formatStockOperationError(error)).toBe('Invoice reference number already processed');
  });

  it('returns default fallback when error is null or undefined', () => {
    expect(formatStockOperationError(null, 'Custom fallback')).toBe('Custom fallback');
  });
});
