import { DomainEvent } from '../shared/domain-event';

export interface TreatmentSessionNoShowPayload {
  readonly sessionId: string;
  readonly clientId: string;
  readonly recordedAt: Date;
}

export class TreatmentSessionNoShowEvent implements DomainEvent<TreatmentSessionNoShowPayload> {
  public readonly eventId: string;
  public readonly eventType = 'TreatmentSessionNoShow';
  public readonly eventName = 'TreatmentSessionNoShow';
  public readonly name = 'TreatmentSessionNoShow';
  public readonly aggregateId: string;
  public readonly version: number;
  public readonly occurredOn: Date;
  public readonly occurredAt: Date;
  public readonly payload: TreatmentSessionNoShowPayload;

  constructor(sessionId: string, clientId: string, version: number, occurredAt: Date = new Date()) {
    this.eventId = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.aggregateId = sessionId;
    this.version = version;
    this.occurredOn = occurredAt;
    this.occurredAt = occurredAt;
    this.payload = {
      sessionId,
      clientId,
      recordedAt: occurredAt,
    };
    Object.freeze(this);
  }
}
