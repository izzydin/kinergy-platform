import { DomainEvent } from '../shared/domain-event';
import { TimeRange } from '../value-objects/time-range.vo';

export interface AppointmentRescheduledPayload {
  readonly appointmentId: string;
  readonly previousTimeRange: { start: Date; end: Date };
  readonly newTimeRange: { start: Date; end: Date };
  readonly rescheduledAt: Date;
}

export class AppointmentRescheduledEvent implements DomainEvent<AppointmentRescheduledPayload> {
  public readonly eventId: string;
  public readonly eventName = 'AppointmentRescheduled';
  public readonly aggregateId: string;
  public readonly occurredOn: Date;
  public readonly payload: AppointmentRescheduledPayload;

  constructor(
    appointmentId: string,
    previousTimeRange: TimeRange,
    newTimeRange: TimeRange,
    rescheduledAt: Date = new Date(),
  ) {
    this.eventId = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.aggregateId = appointmentId;
    this.occurredOn = rescheduledAt;
    this.payload = {
      appointmentId,
      previousTimeRange: previousTimeRange.getValue(),
      newTimeRange: newTimeRange.getValue(),
      rescheduledAt,
    };
    Object.freeze(this);
  }
}
