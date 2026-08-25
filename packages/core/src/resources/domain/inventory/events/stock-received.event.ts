import { InventoryDomainEvent } from './inventory-domain.event';

export interface StockReceivedPayload {
  movementId: string;
  quantityDelta: number;
  balanceAfter: number;
  unitCostAmount: number;
  unitCostCurrency: string;
  reason: string;
  recordedByUserId: string;
  referenceId?: string;
}

export class StockReceivedDomainEvent extends InventoryDomainEvent<StockReceivedPayload> {
  constructor(
    aggregateId: string,
    aggregateVersion: number,
    payload: StockReceivedPayload,
    occurredAt?: Date,
  ) {
    super('StockReceived', aggregateId, aggregateVersion, payload, occurredAt);
  }
}
