import { DomainEvent } from './domain-event';

/**
 * Contract representing an Aggregate Root in the Gym Management domain.
 */
export interface AggregateRoot<ID = string> {
  readonly id: ID;
  readonly version: number;
  getUncommittedEvents(): ReadonlyArray<DomainEvent>;
  clearEvents(): void;
}
