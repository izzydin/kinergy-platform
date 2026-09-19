import { DomainEvent } from '../shared/domain-event';
import { PaymentMethod } from '../enums/payment-method.enum';

export interface PaymentCancelledPayload {
  paymentId: string;
  saleId: string;
  tenantId: string;
  method: PaymentMethod;
  amount: number;
  cents: number;
  currency: string;
  reason?: string;
}

export class PaymentCancelledEvent implements DomainEvent<PaymentCancelledPayload> {
  public readonly eventId: string;
  public readonly eventType = 'PaymentCancelled';
  public readonly aggregateId: string;
  public readonly aggregateVersion: number;
  public readonly occurredAt: Date;
  public readonly payload: PaymentCancelledPayload;

  constructor(
    aggregateId: string,
    aggregateVersion: number,
    payload: PaymentCancelledPayload,
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
