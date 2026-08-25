import { InventoryDomainEvent } from './inventory-domain.event';

export interface StockSoldPayload {
  movementId: string;
  quantityDelta: number;
  balanceAfter: number;
  sellingPriceAmount: number;
  sellingPriceCurrency: string;
  reason: string;
  recordedByUserId: string;
  referenceId?: string;
}

export class StockSoldDomainEvent extends InventoryDomainEvent<StockSoldPayload> {
  constructor(
    aggregateId: string,
    aggregateVersion: number,
    payload: StockSoldPayload,
    occurredAt?: Date,
  ) {
    super('StockSold', aggregateId, aggregateVersion, payload, occurredAt);
  }
}
