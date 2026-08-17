import { DomainEvent } from '../shared/domain-event';

export interface TreatmentSessionStartedPayload {
  readonly sessionId: string;
  readonly clientId: string;
  readonly therapistId: string;
  readonly startedAt: Date;
}

export class TreatmentSessionStartedEvent implements DomainEvent<TreatmentSessionStartedPayload> {
  public readonly eventId: string;
  public readonly eventType = 'TreatmentSessionStarted';
  public readonly eventName = 'TreatmentSessionStarted';
  public readonly name = 'TreatmentSessionStarted';
  public readonly aggregateId: string;
  public readonly version: number;
  public readonly occurredOn: Date;
  public readonly occurredAt: Date;
  public readonly payload: TreatmentSessionStartedPayload;

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
      startedAt: occurredAt,
    };
    Object.freeze(this);
  }
}
