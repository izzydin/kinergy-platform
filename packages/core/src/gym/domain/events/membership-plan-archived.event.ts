import { DomainEvent } from '../shared/domain-event';

export interface MembershipPlanArchivedPayload {
  readonly planId: string;
  readonly code: string;
  readonly archivedAt: Date;
}

export class MembershipPlanArchivedEvent implements DomainEvent<MembershipPlanArchivedPayload> {
  public readonly eventId: string;
  public readonly eventType = 'MembershipPlanArchived';
  public readonly aggregateId: string;
  public readonly aggregateVersion: number;
  public readonly occurredAt: Date;
  public readonly payload: MembershipPlanArchivedPayload;

  constructor(planId: string, code: string, version: number, occurredAt: Date = new Date()) {
    this.eventId = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.aggregateId = planId;
    this.aggregateVersion = version;
    this.occurredAt = new Date(occurredAt.getTime());
    this.payload = Object.freeze({
      planId,
      code,
      archivedAt: new Date(occurredAt.getTime()),
    });
    Object.freeze(this);
  }
}
