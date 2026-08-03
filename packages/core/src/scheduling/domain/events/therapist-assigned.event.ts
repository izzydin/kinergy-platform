import { DomainEvent } from '../shared/domain-event';

export interface TherapistAssignedPayload {
  readonly appointmentId: string;
  readonly oldTherapistId: string;
  readonly newTherapistId: string;
  readonly assignedAt: Date;
}

export class TherapistAssignedEvent implements DomainEvent<TherapistAssignedPayload> {
  public readonly eventId: string;
  public readonly eventName = 'TherapistAssigned';
  public readonly name = 'TherapistAssigned';
  public readonly aggregateId: string;
  public readonly version: number;
  public readonly occurredOn: Date;
  public readonly occurredAt: Date;
  public readonly payload: TherapistAssignedPayload;

  constructor(
    appointmentId: string,
    oldTherapistId: string,
    newTherapistId: string,
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
      oldTherapistId,
      newTherapistId,
      assignedAt: occurredAt,
    };
    Object.freeze(this);
  }

  public get therapistId(): string {
    return this.payload.newTherapistId;
  }
}
