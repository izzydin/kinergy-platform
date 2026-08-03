import { AggregateRoot } from '../shared/aggregate-root';

/**
 * Placeholder Aggregate Root contract for Room.
 */
export interface RoomAggregate extends AggregateRoot<string> {
  readonly name: string;
  readonly capacity: number;
  readonly isAvailable: boolean;
}
