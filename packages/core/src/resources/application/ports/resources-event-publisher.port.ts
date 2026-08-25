import { DomainEvent } from '../../domain/shared/domain-event';

export interface ResourcesEventPublisherPort {
  publish(events: ReadonlyArray<DomainEvent>): Promise<void>;
}
