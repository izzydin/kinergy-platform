import { InventoryDomainEvent } from './inventory-domain.event';

export interface StockConsumedPayload {
  movementId: string;
  quantityDelta: number;
  balanceAfter: number;
  reason: string;
  recordedByUserId: string;
  referenceId?: string;
}

export class StockConsumedDomainEvent extends InventoryDomainEvent<StockConsumedPayload> {
  constructor(
    aggregateId: string,
    aggregateVersion: number,
    payload: StockConsumedPayload,
    occurredAt?: Date,
  ) {
    super('StockConsumed', aggregateId, aggregateVersion, payload, occurredAt);
  }
}
