import { DomainEvent } from '../shared/domain-event';

export interface AppointmentNoShowPayload {
  readonly appointmentId: string;
  readonly reason?: string;
  readonly markedAt: Date;
}

/**
 * Domain Event emitted when an Appointment transitions to NO_SHOW.
 */
export class AppointmentNoShowEvent implements DomainEvent<AppointmentNoShowPayload> {
  public readonly eventId: string;
  public readonly eventName = 'AppointmentNoShow';
  public readonly name = 'AppointmentNoShow';
  public readonly aggregateId: string;
  public readonly version: number;
  public readonly occurredOn: Date;
  public readonly occurredAt: Date;
  public readonly payload: AppointmentNoShowPayload;

  constructor(
    appointmentId: string,
    reason?: string,
    version: number = 1,
    occurredAt: Date = new Date(),
  ) {
    this.eventId = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.aggregateId = appointmentId;
    this.version = version;
    this.occurredOn = occurredAt;
    this.occurredAt = occurredAt;
    this.payload = {
      appointmentId,
      reason,
      markedAt: occurredAt,
    };
    Object.freeze(this);
  }
}
