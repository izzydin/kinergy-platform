import { DomainEvent } from '../shared/domain-event';

export interface MembershipUnfrozenPayload {
  readonly membershipId: string;
  readonly clientId: string;
  readonly newEndDate: Date;
  readonly freezeDurationDays: number;
  readonly unfrozenAt: Date;
}

export class MembershipUnfrozenEvent implements DomainEvent<MembershipUnfrozenPayload> {
  public readonly eventId: string;
  public readonly eventType = 'MembershipUnfrozen';
  public readonly aggregateId: string;
  public readonly aggregateVersion: number;
  public readonly occurredAt: Date;
  public readonly payload: MembershipUnfrozenPayload;

  constructor(
    membershipId: string,
    clientId: string,
    newEndDate: Date,
    freezeDurationDays: number,
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
      newEndDate: new Date(newEndDate.getTime()),
      freezeDurationDays,
      unfrozenAt: new Date(occurredAt.getTime()),
    });
    Object.freeze(this);
  }
}
