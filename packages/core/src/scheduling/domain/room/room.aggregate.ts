import { AggregateRoot } from '../shared/aggregate-root';
import { DomainEvent } from '../shared/domain-event';
import { RoomId } from './room-id.vo';
import { RoomStatus } from '../value-objects/room-status.enum';

/**
 * Properties required to instantiate a new Room aggregate.
 */
export interface CreateRoomProps {
  id?: RoomId;
  name: string;
  capacity: number;
  status?: RoomStatus;
  features?: Iterable<string>;
}

/**
 * Properties required to reconstitute a Room aggregate from persistence storage.
 */
export interface ReconstituteRoomProps {
  id: RoomId;
  version: number;
  name: string;
  capacity: number;
  status: RoomStatus;
  features: Iterable<string>;
  maintenanceReason?: string;
}

/**
 * Room Aggregate Root controlling spatial availability, capacity bounds, and facility features.
 *
 * Invariant: Room reservations never mutate the Room aggregate root. Mutations occur
 * strictly on operational status, capacity, or feature updates.
 */
export class Room implements AggregateRoot<RoomId> {
  private readonly _id: RoomId;
  private _version: number;
  private _name: string;
  private _capacity: number;
  private _status: RoomStatus;
  private readonly _features: Set<string>;
  private _maintenanceReason?: string;
  private uncommittedEvents: DomainEvent[] = [];

  private constructor(props: ReconstituteRoomProps) {
    if (!props.name || props.name.trim().length === 0) {
      throw new Error('Room name cannot be empty.');
    }
    if (!Number.isInteger(props.capacity) || props.capacity <= 0) {
      throw new Error('Room capacity must be a positive integer strictly greater than zero.');
    }

    this._id = props.id;
    this._version = props.version;
    this._name = props.name.trim();
    this._capacity = props.capacity;
    this._status = props.status;
    this._features = new Set(Array.from(props.features).map((f) => f.trim().toLowerCase()));
    this._maintenanceReason = props.maintenanceReason;
  }

  /**
   * Factory method to create a new Room aggregate root.
   *
   * @param props Construction properties for the room
   * @returns Newly initialized Room aggregate with version 1 and default AVAILABLE status
   */
  public static create(props: CreateRoomProps): Room {
    return new Room({
      id: props.id ?? RoomId.create(),
      version: 1,
      name: props.name,
      capacity: props.capacity,
      status: props.status ?? RoomStatus.AVAILABLE,
      features: props.features ?? [],
    });
  }

  /**
   * Reconstitutes an existing Room aggregate root from database hydration state.
   *
   * @param props Persistence DTO properties
   * @returns Reconstituted Room instance
   */
  public static reconstitute(props: ReconstituteRoomProps): Room {
    return new Room(props);
  }

  /** Gets the unique RoomId identifier */
  public get id(): RoomId {
    return this._id;
  }

  /** Gets the optimistic locking version counter */
  public get version(): number {
    return this._version;
  }

  /** Gets the display name of the room */
  public get name(): string {
    return this._name;
  }

  /** Gets the maximum client capacity of the room */
  public get capacity(): number {
    return this._capacity;
  }

  /** Gets the current operational status of the room */
  public get status(): RoomStatus {
    return this._status;
  }

  /** Gets a read-only copy of the room's feature capabilities */
  public get features(): ReadonlySet<string> {
    return new Set(this._features);
  }

  /** Gets the maintenance reason if currently in MAINTENANCE or UNAVAILABLE status */
  public get maintenanceReason(): string | undefined {
    return this._maintenanceReason;
  }

  /**
   * Renames the room and increments the aggregate version counter.
   *
   * @param newName Non-empty new display name
   */
  public rename(newName: string): void {
    if (!newName || newName.trim().length === 0) {
      throw new Error('New room name cannot be empty.');
    }
    this._name = newName.trim();
    this._version += 1;
  }

  /**
   * Updates room capacity ensuring capacity > 0 invariant.
   *
   * @param newCapacity Positive integer capacity
   */
  public changeCapacity(newCapacity: number): void {
    if (!Number.isInteger(newCapacity) || newCapacity <= 0) {
      throw new Error('Room capacity must be a positive integer strictly greater than zero.');
    }
    this._capacity = newCapacity;
    this._version += 1;
  }

  /**
   * Places the room under MAINTENANCE status with an explanation reason.
   *
   * @param reason Mandatory maintenance explanation
   */
  public markMaintenance(reason: string): void {
    if (!reason || reason.trim().length === 0) {
      throw new Error('Maintenance reason is required.');
    }
    this._status = RoomStatus.MAINTENANCE;
    this._maintenanceReason = reason.trim();
    this._version += 1;
  }

  /**
   * Marks the room as AVAILABLE for scheduling and clears maintenance reasons.
   */
  public markAvailable(): void {
    this._status = RoomStatus.AVAILABLE;
    this._maintenanceReason = undefined;
    this._version += 1;
  }

  /**
   * Marks the room as UNAVAILABLE.
   *
   * @param reason Optional unavailability explanation
   */
  public markUnavailable(reason?: string): void {
    this._status = RoomStatus.UNAVAILABLE;
    this._maintenanceReason = reason ? reason.trim() : undefined;
    this._version += 1;
  }

  /**
   * Adds an equipment or facility feature tag to the room.
   *
   * @param feature Feature tag string (e.g. 'hydrotherapy_tub')
   */
  public addFeature(feature: string): void {
    if (!feature || feature.trim().length === 0) {
      throw new Error('Feature name cannot be empty.');
    }
    const cleanFeature = feature.trim().toLowerCase();
    if (!this._features.has(cleanFeature)) {
      this._features.add(cleanFeature);
      this._version += 1;
    }
  }

  /**
   * Removes a feature tag from the room.
   *
   * @param feature Feature tag to remove
   */
  public removeFeature(feature: string): void {
    if (!feature || feature.trim().length === 0) {
      return;
    }
    const cleanFeature = feature.trim().toLowerCase();
    if (this._features.has(cleanFeature)) {
      this._features.delete(cleanFeature);
      this._version += 1;
    }
  }

  /**
   * Evaluates if the room supports all specified required features.
   *
   * @param requiredFeatures Array of required feature tags
   * @returns True if all required features are present in the room's feature set
   */
  public supportsFeatures(requiredFeatures: string[]): boolean {
    if (!requiredFeatures || requiredFeatures.length === 0) {
      return true;
    }
    return requiredFeatures.every((feat) => this._features.has(feat.trim().toLowerCase()));
  }

  /**
   * Retrieves uncommitted domain events recorded by this aggregate.
   */
  public getUncommittedEvents(): ReadonlyArray<DomainEvent> {
    return Object.freeze([...this.uncommittedEvents]);
  }

  /**
   * Clears all recorded uncommitted domain events.
   */
  public clearEvents(): void {
    this.uncommittedEvents = [];
  }

  /**
   * Atomically pulls and clears uncommitted domain events.
   */
  public pullEvents(): ReadonlyArray<DomainEvent> {
    const events = [...this.uncommittedEvents];
    this.uncommittedEvents = [];
    return Object.freeze(events);
  }
}
