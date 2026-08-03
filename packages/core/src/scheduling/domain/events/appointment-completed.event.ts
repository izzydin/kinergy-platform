import { DomainEvent } from '../shared/domain-event';

export interface AppointmentCompletedPayload {
  readonly appointmentId: string;
  readonly completedAt: Date;
}

/**
 * Domain Event emitted when an Appointment transitions to COMPLETED.
 */
export class AppointmentCompletedEvent implements DomainEvent<AppointmentCompletedPayload> {
  public readonly eventId: string;
  public readonly eventName = 'AppointmentCompleted';
  public readonly name = 'AppointmentCompleted';
  public readonly aggregateId: string;
  public readonly version: number;
  public readonly occurredOn: Date;
  public readonly occurredAt: Date;
  public readonly payload: AppointmentCompletedPayload;

  constructor(appointmentId: string, version: number = 1, occurredAt: Date = new Date()) {
    this.eventId = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.aggregateId = appointmentId;
    this.version = version;
    this.occurredOn = occurredAt;
    this.occurredAt = occurredAt;
    this.payload = {
      appointmentId,
      completedAt: occurredAt,
    };
    Object.freeze(this);
  }
}
