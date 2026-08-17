import { DomainEvent } from '../shared/domain-event';

export interface TherapistAssignedToSessionPayload {
  readonly sessionId: string;
  readonly clientId: string;
  readonly previousTherapistId: string;
  readonly newTherapistId: string;
  readonly assignedAt: Date;
}

export class TherapistAssignedToSessionEvent implements DomainEvent<TherapistAssignedToSessionPayload> {
  public readonly eventId: string;
  public readonly eventType = 'TherapistAssignedToSession';
  public readonly eventName = 'TherapistAssignedToSession';
  public readonly name = 'TherapistAssignedToSession';
  public readonly aggregateId: string;
  public readonly version: number;
  public readonly occurredOn: Date;
  public readonly occurredAt: Date;
  public readonly payload: TherapistAssignedToSessionPayload;

  constructor(
    sessionId: string,
    clientId: string,
    previousTherapistId: string,
    newTherapistId: string,
    version: number,
    occurredAt: Date = new Date(),
  ) {
    this.eventId = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.aggregateId = sessionId;
    this.version = version;
    this.occurredOn = occurredAt;
    this.occurredAt = occurredAt;
    this.payload = {
      sessionId,
      clientId,
      previousTherapistId,
      newTherapistId,
      assignedAt: occurredAt,
    };
    Object.freeze(this);
  }
}
