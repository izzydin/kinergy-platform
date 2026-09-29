/**
 * Supported commercial origin categories of a Sale.
 * Defined by ADR-0121 ("Sale Source References and Commercial Origin Model").
 */
export enum SaleSourceType {
  KINESIOLOGY_SESSION = 'KINESIOLOGY_SESSION',
  GYM_MEMBERSHIP = 'GYM_MEMBERSHIP',
  FOOD = 'FOOD',
  DRINK = 'DRINK',
  ROOM_RENTAL = 'ROOM_RENTAL',
}

/**
 * Type guard to validate whether an unknown value is a supported SaleSourceType.
 */
export function isValidSaleSourceType(type: unknown): type is SaleSourceType {
  return typeof type === 'string' && Object.values(SaleSourceType).includes(type as SaleSourceType);
}
