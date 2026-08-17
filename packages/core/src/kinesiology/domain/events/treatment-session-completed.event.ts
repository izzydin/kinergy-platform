import { DomainEvent } from '../shared/domain-event';

export interface TreatmentSessionCompletedPayload {
  readonly sessionId: string;
  readonly clientId: string;
  readonly therapistId: string;
  readonly appointmentId: string;
  readonly completedAt: Date;
}

export class TreatmentSessionCompletedEvent implements DomainEvent<TreatmentSessionCompletedPayload> {
  public readonly eventId: string;
  public readonly eventType = 'TreatmentSessionCompleted';
  public readonly eventName = 'TreatmentSessionCompleted';
  public readonly name = 'TreatmentSessionCompleted';
  public readonly aggregateId: string;
  public readonly version: number;
  public readonly occurredOn: Date;
  public readonly occurredAt: Date;
  public readonly payload: TreatmentSessionCompletedPayload;

  constructor(
    sessionId: string,
    clientId: string,
    therapistId: string,
    appointmentId: string,
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
      appointmentId,
      completedAt: occurredAt,
    };
    Object.freeze(this);
  }
}
