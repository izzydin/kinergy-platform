import { DomainEvent } from '../shared/domain-event';

export interface OccurrenceSkippedPayload {
  readonly seriesId: string;
  readonly occurrenceIndex: number;
  readonly date: Date;
  readonly reason?: string;
  readonly skippedAt: Date;
}

export class OccurrenceSkippedEvent implements DomainEvent<OccurrenceSkippedPayload> {
  public readonly eventId: string;
  public readonly eventName = 'OccurrenceSkipped';
  public readonly name = 'OccurrenceSkipped';
  public readonly aggregateId: string;
  public readonly version: number;
  public readonly occurredOn: Date;
  public readonly occurredAt: Date;
  public readonly payload: OccurrenceSkippedPayload;

  constructor(
    seriesId: string,
    occurrenceIndex: number,
    date: Date,
    reason?: string,
    version: number = 1,
    occurredAt: Date = new Date(),
  ) {
    this.eventId = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.aggregateId = seriesId;
    this.version = version;
    this.occurredOn = occurredAt;
    this.occurredAt = occurredAt;
    this.payload = {
      seriesId,
      occurrenceIndex,
      date,
      reason,
      skippedAt: occurredAt,
    };
    Object.freeze(this);
  }
}
