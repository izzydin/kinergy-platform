import { DomainEvent } from '../shared/domain-event';

export interface MembershipTerminatedPayload {
  readonly membershipId: string;
  readonly clientId: string;
  readonly planId: string;
  readonly terminationReason?: string;
  readonly terminatedAt: Date;
}

export class MembershipTerminatedEvent implements DomainEvent<MembershipTerminatedPayload> {
  public readonly eventId: string;
  public readonly eventType = 'MembershipTerminated';
  public readonly aggregateId: string;
  public readonly aggregateVersion: number;
  public readonly occurredAt: Date;
  public readonly payload: MembershipTerminatedPayload;

  constructor(
    membershipId: string,
    clientId: string,
    planId: string,
    terminationReason: string | undefined,
    version: number,
    occurredAt: Date = new Date(),
  ) {
    this.eventId = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.aggregateId = membershipId;
    this.aggregateVersion = version;
    this.occurredAt = new Date(occurredAt.getTime());
    this.payload = Object.freeze({
      membershipId,
      clientId,
      planId,
      terminationReason,
      terminatedAt: new Date(occurredAt.getTime()),
    });
    Object.freeze(this);
  }
}
