/**
 * Discount calculation mechanisms applicable to line items or entire orders.
 */
export enum DiscountType {
  PERCENTAGE = 'PERCENTAGE',
  FIXED_AMOUNT = 'FIXED_AMOUNT',
}

/**
 * Validates whether a value is a recognized DiscountType enum value.
 */
export function isValidDiscountType(type: unknown): type is DiscountType {
  return typeof type === 'string' && Object.values(DiscountType).includes(type as DiscountType);
}
