import { DomainEvent } from '../../domain/shared/domain-event';

/**
 * Interface contract for Domain Event Subscribers.
 */
export interface EventHandler<TEvent extends DomainEvent> {
  /**
   * Asynchronously processes a domain event.
   *
   * @param event The domain event instance
   */
  handle(event: TEvent): Promise<void>;
}
