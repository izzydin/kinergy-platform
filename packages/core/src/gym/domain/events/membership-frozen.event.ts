import { DomainEvent } from '../shared/domain-event';

export interface MembershipFrozenPayload {
  readonly membershipId: string;
  readonly clientId: string;
  readonly freezeStartDate: Date;
  readonly freezeEndDate: Date;
  readonly reason?: string;
  readonly frozenAt: Date;
}

export class MembershipFrozenEvent implements DomainEvent<MembershipFrozenPayload> {
  public readonly eventId: string;
  public readonly eventType = 'MembershipFrozen';
  public readonly aggregateId: string;
  public readonly aggregateVersion: number;
  public readonly occurredAt: Date;
  public readonly payload: MembershipFrozenPayload;

  constructor(
    membershipId: string,
    clientId: string,
    freezeStartDate: Date,
    freezeEndDate: Date,
    reason: string | undefined,
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
      freezeStartDate: new Date(freezeStartDate.getTime()),
      freezeEndDate: new Date(freezeEndDate.getTime()),
      reason,
      frozenAt: new Date(occurredAt.getTime()),
    });
    Object.freeze(this);
  }
}
