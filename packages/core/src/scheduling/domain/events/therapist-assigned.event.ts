import { DomainEvent } from '../shared/domain-event';

export interface TherapistAssignedPayload {
  readonly appointmentId: string;
  readonly previousTherapistId: string;
  readonly newTherapistId: string;
  readonly assignedAt: Date;
}

export class TherapistAssignedEvent implements DomainEvent<TherapistAssignedPayload> {
  public readonly eventId: string;
  public readonly eventName = 'TherapistAssigned';
  public readonly aggregateId: string;
  public readonly occurredOn: Date;
  public readonly payload: TherapistAssignedPayload;

  constructor(
    appointmentId: string,
    previousTherapistId: string,
    newTherapistId: string,
    assignedAt: Date = new Date(),
  ) {
    this.eventId = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.aggregateId = appointmentId;
    this.occurredOn = assignedAt;
    this.payload = {
      appointmentId,
      previousTherapistId,
      newTherapistId,
      assignedAt,
    };
    Object.freeze(this);
  }
}
