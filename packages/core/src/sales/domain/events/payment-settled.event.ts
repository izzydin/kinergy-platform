import { DomainEvent } from '../shared/domain-event';
import { PaymentMethod } from '../enums/payment-method.enum';

export interface PaymentSettledPayload {
  paymentId: string;
  saleId: string;
  tenantId: string;
  method: PaymentMethod;
  amount: number;
  cents: number;
  currency: string;
  reference: string | null;
  paidAt: Date;
}

export class PaymentSettledEvent implements DomainEvent<PaymentSettledPayload> {
  public readonly eventId: string;
  public readonly eventType = 'PaymentSettled';
  public readonly aggregateId: string;
  public readonly aggregateVersion: number;
  public readonly occurredAt: Date;
  public readonly payload: PaymentSettledPayload;

  constructor(
    aggregateId: string,
    aggregateVersion: number,
    payload: PaymentSettledPayload,
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
