import { DomainEvent } from '../shared/domain-event';

export interface ReceiptIssuedPayload {
  receiptId: string;
  receiptNumber: string;
  saleId: string;
  tenantId: string;
  totalAmount: number;
  totalCents: number;
  currency: string;
  issuedAt: Date;
}

/**
 * Domain event emitted when a Receipt document entity is officially issued upon
 * full settlement of a commercial Sale.
 * Codified by ADR-0117.
 */
export class ReceiptIssuedEvent implements DomainEvent<ReceiptIssuedPayload> {
  public readonly eventId: string;
  public readonly eventType: string;
  public readonly aggregateId: string;
  public readonly aggregateVersion: number;
  public readonly occurredAt: Date;
  public readonly payload: ReceiptIssuedPayload;

  constructor(
    aggregateId: string,
    aggregateVersion: number,
    payload: ReceiptIssuedPayload,
    occurredAt: Date = new Date(),
    eventType: string = 'ReceiptIssued',
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
