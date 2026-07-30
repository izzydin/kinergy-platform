import { IDomainEvent } from '../../domain/kernel/domain-event.interface';
import { AggregateRoot } from '../../domain/kernel/aggregate-root.base';
import { ClientTimelineProjectionHandler } from '../events/client-timeline-projection.handler';

/**
 * DomainEventDispatcher is a lightweight in-process event bus.
 *
 * After an aggregate is saved, call `dispatch(aggregate)` to publish all
 * pending domain events to registered handlers. Errors from handlers are
 * caught so they never roll back the primary business transaction.
 */
export class DomainEventDispatcher {
  private readonly handlers: Array<(event: IDomainEvent) => Promise<void>>;

  constructor(private readonly timelineHandler: ClientTimelineProjectionHandler) {
    this.handlers = [(event) => this.timelineHandler.handle(event)];
  }

  public async dispatch<T>(aggregate: AggregateRoot<T>): Promise<void> {
    const events = [...aggregate.domainEvents];
    aggregate.clearEvents();

    for (const event of events) {
      for (const handler of this.handlers) {
        try {
          await handler(event);
        } catch (err) {
          // Projection errors must NOT bubble up and undo the write transaction
          console.error('[DomainEventDispatcher] handler error:', err);
        }
      }
    }
  }
}
