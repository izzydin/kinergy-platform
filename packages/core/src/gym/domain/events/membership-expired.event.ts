import { DomainEvent } from '../shared/domain-event';

export interface MembershipExpiredPayload {
  readonly membershipId: string;
  readonly clientId: string;
  readonly planId: string;
  readonly expiredAt: Date;
}

export class MembershipExpiredEvent implements DomainEvent<MembershipExpiredPayload> {
  public readonly eventId: string;
  public readonly eventType = 'MembershipExpired';
  public readonly aggregateId: string;
  public readonly aggregateVersion: number;
  public readonly occurredAt: Date;
  public readonly payload: MembershipExpiredPayload;

  constructor(
    membershipId: string,
    clientId: string,
    planId: string,
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
      expiredAt: new Date(occurredAt.getTime()),
    });
    Object.freeze(this);
  }
}
