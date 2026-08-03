import { DomainEvent } from '../shared/domain-event';

export interface AppointmentCancelledPayload {
  readonly appointmentId: string;
  readonly reason: string;
  readonly cancelledAt: Date;
}

export class AppointmentCancelledEvent implements DomainEvent<AppointmentCancelledPayload> {
  public readonly eventId: string;
  public readonly eventName = 'AppointmentCancelled';
  public readonly name = 'AppointmentCancelled';
  public readonly aggregateId: string;
  public readonly version: number;
  public readonly occurredOn: Date;
  public readonly occurredAt: Date;
  public readonly payload: AppointmentCancelledPayload;

  constructor(
    appointmentId: string,
    reason: string,
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
      cancelledAt: occurredAt,
    };
    Object.freeze(this);
  }

  public get reason(): string {
    return this.payload.reason;
  }
}
