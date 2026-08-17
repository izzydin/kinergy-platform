import { DomainEvent } from '../shared/domain-event';

export interface TreatmentSessionCreatedPayload {
  readonly sessionId: string;
  readonly clientId: string;
  readonly therapistId: string;
  readonly appointmentId: string;
  readonly createdAt: Date;
}

export class TreatmentSessionCreatedEvent implements DomainEvent<TreatmentSessionCreatedPayload> {
  public readonly eventId: string;
  public readonly eventType = 'TreatmentSessionCreated';
  public readonly eventName = 'TreatmentSessionCreated';
  public readonly name = 'TreatmentSessionCreated';
  public readonly aggregateId: string;
  public readonly version: number;
  public readonly occurredOn: Date;
  public readonly occurredAt: Date;
  public readonly payload: TreatmentSessionCreatedPayload;

  constructor(
    sessionId: string,
    clientId: string,
    therapistId: string,
    appointmentId: string,
    version: number = 1,
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
      therapistId,
      appointmentId,
      createdAt: occurredAt,
    };
    Object.freeze(this);
  }
}
