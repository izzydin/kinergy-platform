/**
 * Lifecycle states of a commercial Sale transaction.
 */
export enum SaleStatus {
  DRAFT = 'DRAFT',
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  PARTIALLY_PAID = 'PARTIALLY_PAID',
  PAID = 'PAID',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
}

/**
 * Validates whether a value is a recognized SaleStatus enum value.
 */
export function isValidSaleStatus(status: unknown): status is SaleStatus {
  return typeof status === 'string' && Object.values(SaleStatus).includes(status as SaleStatus);
}
