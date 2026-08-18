import { DomainEvent } from '../shared/domain-event';

export interface MembershipPlanPriceChangedPayload {
  readonly planId: string;
  readonly previousAmount: number;
  readonly previousCurrency: string;
  readonly newAmount: number;
  readonly newCurrency: string;
  readonly changedAt: Date;
}

export class MembershipPlanPriceChangedEvent implements DomainEvent<MembershipPlanPriceChangedPayload> {
  public readonly eventId: string;
  public readonly eventType = 'MembershipPlanPriceChanged';
  public readonly aggregateId: string;
  public readonly aggregateVersion: number;
  public readonly occurredAt: Date;
  public readonly payload: MembershipPlanPriceChangedPayload;

  constructor(
    planId: string,
    previousAmount: number,
    previousCurrency: string,
    newAmount: number,
    newCurrency: string,
    version: number,
    occurredAt: Date = new Date(),
  ) {
    this.eventId = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.aggregateId = planId;
    this.aggregateVersion = version;
    this.occurredAt = new Date(occurredAt.getTime());
    this.payload = Object.freeze({
      planId,
      previousAmount,
      previousCurrency,
      newAmount,
      newCurrency,
      changedAt: new Date(occurredAt.getTime()),
    });
    Object.freeze(this);
  }
}
