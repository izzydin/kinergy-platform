import { InventoryDomainEvent } from './inventory-domain.event';

export interface StockScrappedPayload {
  movementId: string;
  quantityDelta: number;
  balanceAfter: number;
  reason: string;
  recordedByUserId: string;
}

export class StockScrappedDomainEvent extends InventoryDomainEvent<StockScrappedPayload> {
  constructor(
    aggregateId: string,
    aggregateVersion: number,
    payload: StockScrappedPayload,
    occurredAt?: Date,
  ) {
    super('StockScrapped', aggregateId, aggregateVersion, payload, occurredAt);
  }
}
