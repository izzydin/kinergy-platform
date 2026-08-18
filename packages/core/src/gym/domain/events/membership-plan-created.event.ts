import { DomainEvent } from '../shared/domain-event';

export interface MembershipPlanCreatedPayload {
  readonly planId: string;
  readonly code: string;
  readonly name: string;
  readonly durationInDays: number;
  readonly priceAmount: number;
  readonly priceCurrency: string;
  readonly visitQuota?: number;
  readonly status: string;
  readonly createdAt: Date;
}

export class MembershipPlanCreatedEvent implements DomainEvent<MembershipPlanCreatedPayload> {
  public readonly eventId: string;
  public readonly eventType = 'MembershipPlanCreated';
  public readonly aggregateId: string;
  public readonly aggregateVersion: number;
  public readonly occurredAt: Date;
  public readonly payload: MembershipPlanCreatedPayload;

  constructor(
    planId: string,
    code: string,
    name: string,
    durationInDays: number,
    priceAmount: number,
    priceCurrency: string,
    status: string,
    visitQuota?: number,
    version: number = 1,
    occurredAt: Date = new Date(),
  ) {
    this.eventId = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.aggregateId = planId;
    this.aggregateVersion = version;
    this.occurredAt = new Date(occurredAt.getTime());
    this.payload = Object.freeze({
      planId,
      code,
      name,
      durationInDays,
      priceAmount,
      priceCurrency,
      status,
      visitQuota,
      createdAt: new Date(occurredAt.getTime()),
    });
    Object.freeze(this);
  }
}
