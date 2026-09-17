import { DomainEvent } from '../shared/domain-event';

export interface SaleFinalizedPayload {
  saleId: string;
  totalAmount: number;
  currency: string;
  itemCount: number;
}

export class SaleFinalizedEvent implements DomainEvent<SaleFinalizedPayload> {
  public readonly eventId: string;
  public readonly eventType = 'SaleFinalized';
  public readonly aggregateId: string;
  public readonly aggregateVersion: number;
  public readonly occurredAt: Date;
  public readonly payload: SaleFinalizedPayload;

  constructor(
    aggregateId: string,
    aggregateVersion: number,
    payload: SaleFinalizedPayload,
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
