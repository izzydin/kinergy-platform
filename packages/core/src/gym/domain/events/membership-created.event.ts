import { DomainEvent } from '../shared/domain-event';

export interface MembershipCreatedPayload {
  readonly membershipId: string;
  readonly clientId: string;
  readonly planId: string;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly status: string;
  readonly createdAt: Date;
}

export class MembershipCreatedEvent implements DomainEvent<MembershipCreatedPayload> {
  public readonly eventId: string;
  public readonly eventType = 'MembershipCreated';
  public readonly aggregateId: string;
  public readonly aggregateVersion: number;
  public readonly occurredAt: Date;
  public readonly payload: MembershipCreatedPayload;

  constructor(
    membershipId: string,
    clientId: string,
    planId: string,
    startDate: Date,
    endDate: Date,
    status: string,
    version: number = 1,
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
      startDate: new Date(startDate.getTime()),
      endDate: new Date(endDate.getTime()),
      status,
      createdAt: new Date(occurredAt.getTime()),
    });
    Object.freeze(this);
  }
}
