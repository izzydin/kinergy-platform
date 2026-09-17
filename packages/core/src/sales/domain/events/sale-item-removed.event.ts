import { DomainEvent } from '../shared/domain-event';

export interface SaleItemRemovedPayload {
  saleId: string;
  itemId: string;
}

export class SaleItemRemovedEvent implements DomainEvent<SaleItemRemovedPayload> {
  public readonly eventId: string;
  public readonly eventType = 'SaleItemRemoved';
  public readonly aggregateId: string;
  public readonly aggregateVersion: number;
  public readonly occurredAt: Date;
  public readonly payload: SaleItemRemovedPayload;

  constructor(
    aggregateId: string,
    aggregateVersion: number,
    payload: SaleItemRemovedPayload,
    occurredAt: Date = new Date(),
  ) {
    this.eventId = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.aggregateId = aggregateId;
    this.aggregateVersion = aggregateVersion;
    this.occurredAt = occurredAt;
    this.payload = payload;
    Object.freeze(this);
  }
}
