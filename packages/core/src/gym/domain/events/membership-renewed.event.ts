import { DomainEvent } from '../shared/domain-event';

export interface MembershipRenewedPayload {
  readonly membershipId: string;
  readonly clientId: string;
  readonly planId: string;
  readonly newStartDate: Date;
  readonly newEndDate: Date;
  readonly renewedAt: Date;
}

export class MembershipRenewedEvent implements DomainEvent<MembershipRenewedPayload> {
  public readonly eventId: string;
  public readonly eventType = 'MembershipRenewed';
  public readonly aggregateId: string;
  public readonly aggregateVersion: number;
  public readonly occurredAt: Date;
  public readonly payload: MembershipRenewedPayload;

  constructor(
    membershipId: string,
    clientId: string,
    planId: string,
    newStartDate: Date,
    newEndDate: Date,
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
      newStartDate: new Date(newStartDate.getTime()),
      newEndDate: new Date(newEndDate.getTime()),
      renewedAt: new Date(occurredAt.getTime()),
    });
    Object.freeze(this);
  }
}
