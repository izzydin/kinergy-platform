import { DomainEvent } from '../../domain/shared/domain-event';

/**
 * Port interface for publishing Gym domain events asynchronously or to outbox.
 */
export interface GymEventPublisherPort {
  publish(events: ReadonlyArray<DomainEvent>): Promise<void>;
}
