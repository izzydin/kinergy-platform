import { DomainEvent } from '../shared/domain-event';

export interface SalePartiallyPaidPayload {
  saleId: string;
  totalAmount: number;
  currency: string;
}

export class SalePartiallyPaidEvent implements DomainEvent<SalePartiallyPaidPayload> {
  public readonly eventId: string;
  public readonly eventType = 'SalePartiallyPaid';
  public readonly aggregateId: string;
  public readonly aggregateVersion: number;
  public readonly occurredAt: Date;
  public readonly payload: SalePartiallyPaidPayload;

  constructor(
    aggregateId: string,
    aggregateVersion: number,
    payload: SalePartiallyPaidPayload,
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
