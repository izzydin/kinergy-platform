/**
 * Domain Event contract for Kynergy Intelligence bounded context.
 * Pure TypeScript representation of an immutable domain fact.
 */
export interface DomainEvent<TPayload = unknown> {
  readonly eventId: string;
  readonly eventType: string;
  readonly aggregateId: string;
  readonly aggregateVersion: number;
  readonly occurredAt: Date;
  readonly payload?: TPayload;
}
