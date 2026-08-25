import { InventoryDomainEvent } from './inventory-domain.event';

export interface LowStockThresholdReachedPayload {
  sku: string;
  itemName: string;
  currentStock: number;
  minimumStock: number;
}

export class LowStockThresholdReachedDomainEvent extends InventoryDomainEvent<LowStockThresholdReachedPayload> {
  constructor(
    aggregateId: string,
    aggregateVersion: number,
    payload: LowStockThresholdReachedPayload,
    occurredAt?: Date,
  ) {
    super('LowStockThresholdReached', aggregateId, aggregateVersion, payload, occurredAt);
  }
}
