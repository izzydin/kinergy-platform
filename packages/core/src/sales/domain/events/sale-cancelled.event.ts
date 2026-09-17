import { DomainEvent } from '../shared/domain-event';

export interface SaleCancelledPayload {
  saleId: string;
  reason?: string;
}

export class SaleCancelledEvent implements DomainEvent<SaleCancelledPayload> {
  public readonly eventId: string;
  public readonly eventType = 'SaleCancelled';
  public readonly aggregateId: string;
  public readonly aggregateVersion: number;
  public readonly occurredAt: Date;
  public readonly payload: SaleCancelledPayload;

  constructor(
    aggregateId: string,
    aggregateVersion: number,
    payload: SaleCancelledPayload,
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
