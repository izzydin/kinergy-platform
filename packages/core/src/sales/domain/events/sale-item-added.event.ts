import { DomainEvent } from '../shared/domain-event';

export interface SaleItemAddedPayload {
  saleId: string;
  itemId: string;
  sourceType: string;
  sourceId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  currency: string;
}

export class SaleItemAddedEvent implements DomainEvent<SaleItemAddedPayload> {
  public readonly eventId: string;
  public readonly eventType = 'SaleItemAdded';
  public readonly aggregateId: string;
  public readonly aggregateVersion: number;
  public readonly occurredAt: Date;
  public readonly payload: SaleItemAddedPayload;

  constructor(
    aggregateId: string,
    aggregateVersion: number,
    payload: SaleItemAddedPayload,
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
