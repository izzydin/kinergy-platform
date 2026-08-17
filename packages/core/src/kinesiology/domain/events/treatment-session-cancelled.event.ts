import { DomainEvent } from '../shared/domain-event';

export interface TreatmentSessionCancelledPayload {
  readonly sessionId: string;
  readonly clientId: string;
  readonly reason?: string;
  readonly cancelledAt: Date;
}

export class TreatmentSessionCancelledEvent implements DomainEvent<TreatmentSessionCancelledPayload> {
  public readonly eventId: string;
  public readonly eventType = 'TreatmentSessionCancelled';
  public readonly eventName = 'TreatmentSessionCancelled';
  public readonly name = 'TreatmentSessionCancelled';
  public readonly aggregateId: string;
  public readonly version: number;
  public readonly occurredOn: Date;
  public readonly occurredAt: Date;
  public readonly payload: TreatmentSessionCancelledPayload;

  constructor(
    sessionId: string,
    clientId: string,
    reason?: string,
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
      reason,
      cancelledAt: occurredAt,
    };
    Object.freeze(this);
  }

  public get reason(): string | undefined {
    return this.payload.reason;
  }
}
