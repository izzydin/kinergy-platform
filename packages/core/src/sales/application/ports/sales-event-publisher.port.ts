import { DomainEvent } from '../../domain/shared/domain-event';

export interface SalesEventPublisherPort {
  publish(events: ReadonlyArray<DomainEvent>): Promise<void>;
}
