import { DomainEvent } from '../shared/domain-event';

export interface TreatmentSessionNotesUpdatedPayload {
  readonly sessionId: string;
  readonly clientId: string;
  readonly therapistId: string;
  readonly updatedAt: Date;
}

export class TreatmentSessionNotesUpdatedEvent implements DomainEvent<TreatmentSessionNotesUpdatedPayload> {
  public readonly eventId: string;
  public readonly eventType = 'TreatmentSessionNotesUpdated';
  public readonly eventName = 'TreatmentSessionNotesUpdated';
  public readonly name = 'TreatmentSessionNotesUpdated';
  public readonly aggregateId: string;
  public readonly version: number;
  public readonly occurredOn: Date;
  public readonly occurredAt: Date;
  public readonly payload: TreatmentSessionNotesUpdatedPayload;

  constructor(
    sessionId: string,
    clientId: string,
    therapistId: string,
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
      therapistId,
      updatedAt: occurredAt,
    };
    Object.freeze(this);
  }
}
