import { DomainEvent } from '../shared/domain-event';
import { TimeRange } from '../value-objects/time-range.vo';

export interface AppointmentRescheduledPayload {
  readonly appointmentId: string;
  readonly oldTimeRange: { start: Date; end: Date };
  readonly newTimeRange: { start: Date; end: Date };
  readonly rescheduledAt: Date;
}

export class AppointmentRescheduledEvent implements DomainEvent<AppointmentRescheduledPayload> {
  public readonly eventId: string;
  public readonly eventName = 'AppointmentRescheduled';
  public readonly name = 'AppointmentRescheduled';
  public readonly aggregateId: string;
  public readonly version: number;
  public readonly occurredOn: Date;
  public readonly occurredAt: Date;
  public readonly payload: AppointmentRescheduledPayload;
  public readonly newTimeRange: TimeRange;

  constructor(
    appointmentId: string,
    oldTimeRange: TimeRange,
    newTimeRange: TimeRange,
    version: number = 1,
    occurredAt: Date = new Date(),
  ) {
    this.eventId = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.aggregateId = appointmentId;
    this.version = version;
    this.occurredOn = occurredAt;
    this.occurredAt = occurredAt;
    this.newTimeRange = newTimeRange;
    this.payload = {
      appointmentId,
      oldTimeRange: oldTimeRange.getValue(),
      newTimeRange: newTimeRange.getValue(),
      rescheduledAt: occurredAt,
    };
    Object.freeze(this);
  }
}
