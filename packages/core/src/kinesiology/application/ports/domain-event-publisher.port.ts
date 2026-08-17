import { DomainEvent } from '../../domain/shared/domain-event';

/**
 * Port interface for publishing domain events originating from Kinesiology aggregates.
 */
export interface DomainEventPublisher {
  publish(event: DomainEvent): Promise<void> | void;
}
