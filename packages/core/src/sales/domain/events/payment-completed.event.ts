import { DomainEvent } from '../shared/domain-event';
import { PaymentMethod } from '../enums/payment-method.enum';

export interface PaymentCompletedPayload {
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

/**
 * Domain event emitted when a Payment aggregate enters the COMPLETED lifecycle state.
 * Marks permanent write-once financial immutability.
 */
export class PaymentCompletedEvent implements DomainEvent<PaymentCompletedPayload> {
  public readonly eventId: string;
  public readonly eventType: string;
  public readonly aggregateId: string;
  public readonly aggregateVersion: number;
  public readonly occurredAt: Date;
  public readonly payload: PaymentCompletedPayload;

  constructor(
    aggregateId: string,
    aggregateVersion: number,
    payload: PaymentCompletedPayload,
    occurredAt: Date = new Date(),
    eventType: string = 'PaymentCompleted',
  ) {
    this.eventId = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.eventType = eventType;
    this.aggregateId = aggregateId;
    this.aggregateVersion = aggregateVersion;
    this.occurredAt = occurredAt;
    this.payload = payload;
    Object.freeze(this);
  }
}
