import { InventoryDomainEvent } from './inventory-domain.event';

export interface StockCorrectedPayload {
  movementId: string;
  previousBalance: number;
  newBalance: number;
  quantityDelta: number;
  reason: string;
  recordedByUserId: string;
}

export class StockCorrectedDomainEvent extends InventoryDomainEvent<StockCorrectedPayload> {
  constructor(
    aggregateId: string,
    aggregateVersion: number,
    payload: StockCorrectedPayload,
    occurredAt?: Date,
  ) {
    super('StockCorrected', aggregateId, aggregateVersion, payload, occurredAt);
  }
}
