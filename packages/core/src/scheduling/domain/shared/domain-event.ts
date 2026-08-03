/**
 * Contract representing a generic Domain Event emitted by Domain Aggregates.
 */
export interface DomainEvent<T = unknown> {
  readonly eventId: string;
  readonly eventName: string;
  readonly aggregateId: string;
  readonly occurredOn: Date;
  readonly payload: T;
}
