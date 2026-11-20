import { DomainEvent } from './domain-event';

/**
 * Aggregate Root contract for Kynergy Intelligence bounded context.
 */
export interface AggregateRoot<ID = string> {
  readonly id: ID;
  readonly version: number;
  getUncommittedEvents(): ReadonlyArray<DomainEvent>;
  clearEvents(): void;
}
