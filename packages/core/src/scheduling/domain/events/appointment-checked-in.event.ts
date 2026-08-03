import { DomainEvent } from '../shared/domain-event';

export interface AppointmentCheckedInPayload {
  readonly appointmentId: string;
  readonly checkedInAt: Date;
}

/**
 * Domain Event emitted when an Appointment transitions to CHECKED_IN.
 */
export class AppointmentCheckedInEvent implements DomainEvent<AppointmentCheckedInPayload> {
  public readonly eventId: string;
  public readonly eventName = 'AppointmentCheckedIn';
  public readonly name = 'AppointmentCheckedIn';
  public readonly aggregateId: string;
  public readonly version: number;
  public readonly occurredOn: Date;
  public readonly occurredAt: Date;
  public readonly payload: AppointmentCheckedInPayload;

  constructor(appointmentId: string, version: number = 1, occurredAt: Date = new Date()) {
    this.eventId = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.aggregateId = appointmentId;
    this.version = version;
    this.occurredOn = occurredAt;
    this.occurredAt = occurredAt;
    this.payload = {
      appointmentId,
      checkedInAt: occurredAt,
    };
    Object.freeze(this);
  }
}
