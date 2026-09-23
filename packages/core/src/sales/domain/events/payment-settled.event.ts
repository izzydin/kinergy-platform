import { PaymentCompletedEvent, PaymentCompletedPayload } from './payment-completed.event';

export type PaymentSettledPayload = PaymentCompletedPayload;

/**
 * Domain event alias for PaymentCompletedEvent to maintain backward compatibility.
 */
export class PaymentSettledEvent extends PaymentCompletedEvent {
  constructor(
    aggregateId: string,
    aggregateVersion: number,
    payload: PaymentSettledPayload,
    occurredAt?: Date,
  ) {
    super(aggregateId, aggregateVersion, payload, occurredAt, 'PaymentSettled');
  }
}
