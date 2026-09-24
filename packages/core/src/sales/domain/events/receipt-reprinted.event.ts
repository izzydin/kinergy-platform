import { DomainEvent } from '../shared/domain-event';

export interface ReceiptReprintedPayload {
  receiptId: string;
  receiptNumber: string;
  saleId: string;
  tenantId: string;
  reprintCount: number;
  reprintedAt: Date;
}

/**
 * Domain event emitted when an existing Receipt snapshot is re-rendered or reprinted
 * with a mandatory duplicate watermark.
 * Codified by ADR-0117.
 */
export class ReceiptReprintedEvent implements DomainEvent<ReceiptReprintedPayload> {
  public readonly eventId: string;
  public readonly eventType: string;
  public readonly aggregateId: string;
  public readonly aggregateVersion: number;
  public readonly occurredAt: Date;
  public readonly payload: ReceiptReprintedPayload;

  constructor(
    aggregateId: string,
    aggregateVersion: number,
    payload: ReceiptReprintedPayload,
    occurredAt: Date = new Date(),
    eventType: string = 'ReceiptReprinted',
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
