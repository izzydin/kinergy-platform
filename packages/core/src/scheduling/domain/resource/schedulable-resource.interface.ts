import { AggregateRoot } from '../shared/aggregate-root';
import { ValueObject } from '../shared/value-object';
import { ResourceType } from './resource-type.enum';
import { ResourceStatus } from './resource-status.enum';

/**
 * Domain interface contract for all schedulable physical or facility assets.
 *
 * Encapsulates core scheduling capabilities (identity, taxonomy, capacity, operational status,
 * reservability) without coupling to resource-specific attributes (e.g. room features, serial numbers).
 */
export interface SchedulableResource<
  ID extends ValueObject<string> = ValueObject<string>,
> extends AggregateRoot<ID> {
  /** Strongly-typed domain identifier */
  readonly id: ID;

  /** Taxonomy type of the schedulable resource */
  readonly resourceType: ResourceType;

  /** Human-readable display label/name of the resource */
  readonly name: string;

  /** Maximum simultaneous client/occupancy capacity (must be integer >= 1) */
  readonly capacity: number;

  /** Current operational lifecycle status */
  readonly status: ResourceStatus;

  /** Optimistic locking concurrency counter */
  readonly version: number;

  /**
   * Evaluates if the resource is currently reservable for scheduling.
   *
   * @returns true if status is AVAILABLE, false if MAINTENANCE or UNAVAILABLE
   */
  isReservable(): boolean;
}
