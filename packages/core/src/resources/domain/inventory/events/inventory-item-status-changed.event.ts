import { InventoryDomainEvent } from './inventory-domain.event';
import { InventoryItemStatus } from '../enums/inventory-item-status.enum';

export interface InventoryItemStatusChangedPayload {
  previousStatus: InventoryItemStatus;
  newStatus: InventoryItemStatus;
  reason?: string;
  actorId: string;
}

export class InventoryItemStatusChangedEvent extends InventoryDomainEvent<InventoryItemStatusChangedPayload> {
  constructor(
    aggregateId: string,
    aggregateVersion: number,
    payload: InventoryItemStatusChangedPayload,
    occurredAt?: Date,
  ) {
    super('InventoryItemStatusChanged', aggregateId, aggregateVersion, payload, occurredAt);
  }
}
