import { DomainEvent } from '../shared/domain-event';

export interface RecurringSeriesCancelledPayload {
  readonly seriesId: string;
  readonly reason: string;
  readonly cancelledAt: Date;
}

export class RecurringSeriesCancelledEvent implements DomainEvent<RecurringSeriesCancelledPayload> {
  public readonly eventId: string;
  public readonly eventName = 'RecurringSeriesCancelled';
  public readonly name = 'RecurringSeriesCancelled';
  public readonly aggregateId: string;
  public readonly version: number;
  public readonly occurredOn: Date;
  public readonly occurredAt: Date;
  public readonly payload: RecurringSeriesCancelledPayload;

  constructor(
    seriesId: string,
    reason: string,
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
      reason,
      cancelledAt: occurredAt,
    };
    Object.freeze(this);
  }
}
