/**
 * Contract representing a generic Domain Event emitted by Domain Aggregates.
 */
export interface DomainEvent<T = unknown> {
  readonly eventId: string;
  readonly eventType: string;
  readonly eventName: string;
  readonly name: string;
  readonly aggregateId: string;
  readonly version: number;
  readonly occurredOn: Date;
  readonly occurredAt: Date;
  readonly payload: T;
}
