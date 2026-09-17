/**
 * Contract representing an immutable domain event in the Sales bounded context.
 */
export interface DomainEvent<TPayload = unknown> {
  readonly eventId: string;
  readonly eventType: string;
  readonly aggregateId: string;
  readonly aggregateVersion: number;
  readonly occurredAt: Date;
  readonly payload?: TPayload;
}
