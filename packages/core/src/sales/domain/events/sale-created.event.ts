import { DomainEvent } from '../shared/domain-event';
import { SaleStatus } from '../enums/sale-status.enum';

export interface SaleCreatedPayload {
  saleId: string;
  tenantId?: string;
  clientId?: string;
  currency: string;
  status: SaleStatus;
}

export class SaleCreatedEvent implements DomainEvent<SaleCreatedPayload> {
  public readonly eventId: string;
  public readonly eventType = 'SaleCreated';
  public readonly aggregateId: string;
  public readonly aggregateVersion: number;
  public readonly occurredAt: Date;
  public readonly payload: SaleCreatedPayload;

  constructor(
    aggregateId: string,
    aggregateVersion: number,
    payload: SaleCreatedPayload,
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
