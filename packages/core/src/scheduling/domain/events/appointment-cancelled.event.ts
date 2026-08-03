import { DomainEvent } from '../shared/domain-event';

export interface AppointmentCancelledPayload {
  readonly appointmentId: string;
  readonly reason: string;
  readonly cancelledAt: Date;
}

export class AppointmentCancelledEvent implements DomainEvent<AppointmentCancelledPayload> {
  public readonly eventId: string;
  public readonly eventName = 'AppointmentCancelled';
  public readonly aggregateId: string;
  public readonly occurredOn: Date;
  public readonly payload: AppointmentCancelledPayload;

  constructor(appointmentId: string, reason: string, cancelledAt: Date = new Date()) {
    this.eventId = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.aggregateId = appointmentId;
    this.occurredOn = cancelledAt;
    this.payload = {
      appointmentId,
      reason,
      cancelledAt,
    };
    Object.freeze(this);
  }
}
