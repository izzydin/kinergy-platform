/**
 * Authoritative operational classification for physical stock changes.
 *
 * Enforces strict directional mutation semantics and provenance context
 * across Kinergy's inventory ledger.
 */
export enum StockMovementType {
  PURCHASE = 'PURCHASE',
  SALE = 'SALE',
  CONSUMPTION = 'CONSUMPTION',
  ADJUSTMENT_IN = 'ADJUSTMENT_IN',
  ADJUSTMENT_OUT = 'ADJUSTMENT_OUT',
  CORRECTION = 'CORRECTION',
  SCRAP = 'SCRAP',
}

/**
 * Directional mutation classification of a stock movement.
 */
export type MovementDirection = 'INCREASE' | 'DECREASE' | 'VARIABLE';

/**
 * Metadata descriptor for a StockMovementType.
 */
export interface StockMovementTypeDescriptor {
  readonly code: StockMovementType;
  readonly displayName: string;
  readonly direction: MovementDirection;
  readonly description: string;
  readonly requiresMandatoryReason: boolean;
}

export const STOCK_MOVEMENT_TYPE_REGISTRY: Record<StockMovementType, StockMovementTypeDescriptor> =
  {
    [StockMovementType.PURCHASE]: {
      code: StockMovementType.PURCHASE,
      displayName: 'Purchase Receipt',
      direction: 'INCREASE',
      description: 'Stock received from external vendor or distributor (+Delta).',
      requiresMandatoryReason: true,
    },
    [StockMovementType.SALE]: {
      code: StockMovementType.SALE,
      displayName: 'Retail Sale',
      direction: 'DECREASE',
      description: 'Stock sold to client or patient at point-of-sale (-Delta).',
      requiresMandatoryReason: true,
    },
    [StockMovementType.CONSUMPTION]: {
      code: StockMovementType.CONSUMPTION,
      displayName: 'Clinical Consumption',
      direction: 'DECREASE',
      description: 'Supplies consumed during kinesiology or rehab treatment (-Delta).',
      requiresMandatoryReason: true,
    },
    [StockMovementType.ADJUSTMENT_IN]: {
      code: StockMovementType.ADJUSTMENT_IN,
      displayName: 'Manual Adjustment (In)',
      direction: 'INCREASE',
      description: 'Manual positive stock adjustment from audit discovery (+Delta).',
      requiresMandatoryReason: true,
    },
    [StockMovementType.ADJUSTMENT_OUT]: {
      code: StockMovementType.ADJUSTMENT_OUT,
      displayName: 'Manual Adjustment (Out)',
      direction: 'DECREASE',
      description: 'Manual negative stock adjustment for shrinkage or loss (-Delta).',
      requiresMandatoryReason: true,
    },
    [StockMovementType.CORRECTION]: {
      code: StockMovementType.CORRECTION,
      displayName: 'Inventory Reconciliation',
      direction: 'VARIABLE',
      description: 'Direct adjustment to target physical count (+/- Delta).',
      requiresMandatoryReason: true,
    },
    [StockMovementType.SCRAP]: {
      code: StockMovementType.SCRAP,
      displayName: 'Scrapped / Expired',
      direction: 'DECREASE',
      description: 'Removal and disposal of damaged, contaminated, or expired stock (-Delta).',
      requiresMandatoryReason: true,
    },
  };

/**
 * Validates whether a given string is a valid StockMovementType enum value.
 */
export function isValidStockMovementType(value: unknown): value is StockMovementType {
  return (
    typeof value === 'string' &&
    Object.values(StockMovementType).includes(value as StockMovementType)
  );
}

/**
 * Parses and validates an input string into a strongly-typed StockMovementType.
 */
export function parseStockMovementType(value: unknown): StockMovementType {
  if (isValidStockMovementType(value)) {
    return value;
  }
  throw new Error(
    `Invalid stock movement type: '${value}'. Valid types are: ${Object.values(StockMovementType).join(', ')}`,
  );
}
