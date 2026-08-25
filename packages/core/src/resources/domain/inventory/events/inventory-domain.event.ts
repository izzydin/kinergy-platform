import { DomainEvent } from '../../shared/domain-event';

export abstract class InventoryDomainEvent<TPayload = unknown> implements DomainEvent<TPayload> {
  public readonly eventId: string;
  public readonly occurredAt: Date;

  constructor(
    public readonly eventType: string,
    public readonly aggregateId: string,
    public readonly aggregateVersion: number,
    public readonly payload?: TPayload,
    occurredAt?: Date,
  ) {
    this.eventId = crypto.randomUUID();
    this.occurredAt = occurredAt ?? new Date();
  }
}
