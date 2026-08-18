import { DomainEvent } from '../shared/domain-event';

export interface MembershipPlanPublishedPayload {
  readonly planId: string;
  readonly code: string;
  readonly publishedAt: Date;
}

export class MembershipPlanPublishedEvent implements DomainEvent<MembershipPlanPublishedPayload> {
  public readonly eventId: string;
  public readonly eventType = 'MembershipPlanPublished';
  public readonly aggregateId: string;
  public readonly aggregateVersion: number;
  public readonly occurredAt: Date;
  public readonly payload: MembershipPlanPublishedPayload;

  constructor(planId: string, code: string, version: number, occurredAt: Date = new Date()) {
    this.eventId = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.aggregateId = planId;
    this.aggregateVersion = version;
    this.occurredAt = new Date(occurredAt.getTime());
    this.payload = Object.freeze({
      planId,
      code,
      publishedAt: new Date(occurredAt.getTime()),
    });
    Object.freeze(this);
  }
}
