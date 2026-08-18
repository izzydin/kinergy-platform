import { DomainEvent } from '../shared/domain-event';

export interface MembershipCancelledPayload {
  readonly membershipId: string;
  readonly clientId: string;
  readonly planId: string;
  readonly cancellationReason?: string;
  readonly cancelledAt: Date;
}

export class MembershipCancelledEvent implements DomainEvent<MembershipCancelledPayload> {
  public readonly eventId: string;
  public readonly eventType = 'MembershipCancelled';
  public readonly aggregateId: string;
  public readonly aggregateVersion: number;
  public readonly occurredAt: Date;
  public readonly payload: MembershipCancelledPayload;

  constructor(
    membershipId: string,
    clientId: string,
    planId: string,
    cancellationReason: string | undefined,
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
      cancellationReason,
      cancelledAt: new Date(occurredAt.getTime()),
    });
    Object.freeze(this);
  }
}
