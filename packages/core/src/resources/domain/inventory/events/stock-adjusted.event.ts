import { InventoryDomainEvent } from './inventory-domain.event';
import { StockMovementType } from '../enums/stock-movement-type.enum';

export interface StockAdjustedPayload {
  movementId: string;
  movementType: StockMovementType.ADJUSTMENT_IN | StockMovementType.ADJUSTMENT_OUT;
  quantityDelta: number;
  balanceAfter: number;
  reason: string;
  recordedByUserId: string;
}

export class StockAdjustedDomainEvent extends InventoryDomainEvent<StockAdjustedPayload> {
  constructor(
    aggregateId: string,
    aggregateVersion: number,
    payload: StockAdjustedPayload,
    occurredAt?: Date,
  ) {
    super('StockAdjusted', aggregateId, aggregateVersion, payload, occurredAt);
  }
}
