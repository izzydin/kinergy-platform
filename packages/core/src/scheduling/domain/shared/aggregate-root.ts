import { DomainEvent } from './domain-event';

/**
 * Contract representing an Aggregate Root in Domain-Driven Design.
 */
export interface AggregateRoot<ID = string> {
  readonly id: ID;
  readonly version: number;
  getUncommittedEvents(): ReadonlyArray<DomainEvent>;
  clearEvents(): void;
}
