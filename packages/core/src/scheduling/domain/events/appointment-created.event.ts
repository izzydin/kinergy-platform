import { DomainEvent } from '../shared/domain-event';
import { AppointmentType } from '../value-objects/appointment-type.vo';
import { TimeRange } from '../value-objects/time-range.vo';

export interface AppointmentCreatedPayload {
  readonly appointmentId: string;
  readonly clientId: string;
  readonly therapistId: string;
  readonly roomId: string;
  readonly type: string;
  readonly timeRange: { start: Date; end: Date };
  readonly createdAt: Date;
}

export class AppointmentCreatedEvent implements DomainEvent<AppointmentCreatedPayload> {
  public readonly eventId: string;
  public readonly eventName = 'AppointmentCreated';
  public readonly aggregateId: string;
  public readonly occurredOn: Date;
  public readonly payload: AppointmentCreatedPayload;

  constructor(
    appointmentId: string,
    clientId: string,
    therapistId: string,
    roomId: string,
    type: AppointmentType,
    timeRange: TimeRange,
    occurredOn: Date = new Date(),
  ) {
    this.eventId = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.aggregateId = appointmentId;
    this.occurredOn = occurredOn;
    this.payload = {
      appointmentId,
      clientId,
      therapistId,
      roomId,
      type: type.getValue(),
      timeRange: timeRange.getValue(),
      createdAt: occurredOn,
    };
    Object.freeze(this);
  }
}
