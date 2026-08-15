import { AggregateRoot } from '../shared/aggregate-root';
import { DomainEvent } from '../shared/domain-event';
import { RoomId } from './room-id.vo';
import { RoomStatus } from '../value-objects/room-status.enum';
import { SchedulableResource } from '../resource/schedulable-resource.interface';
import { ResourceType } from '../resource/resource-type.enum';
import { MaintenanceWindow, CreateMaintenanceWindowProps } from './maintenance-window.vo';
import { TimeRange } from '../value-objects/time-range.vo';
import { TurnaroundBuffer } from '../value-objects/turnaround-buffer.vo';

// Domain Events
import { RoomCreatedEvent } from '../events/room-created.event';
import { RoomActivatedEvent } from '../events/room-activated.event';
import { RoomDeactivatedEvent } from '../events/room-deactivated.event';
import { RoomMarkedMaintenanceEvent } from '../events/room-maintenance.event';
import { RoomMaintenanceScheduledEvent } from '../events/room-maintenance-scheduled.event';
import { RoomMaintenanceCancelledEvent } from '../events/room-maintenance-cancelled.event';

/**
 * Properties required to instantiate a new Room aggregate.
 */
export interface CreateRoomProps {
  id?: RoomId;
  name: string;
  capacity: number;
  status?: RoomStatus;
  features?: Iterable<string>;
  maintenanceWindows?: Iterable<MaintenanceWindow>;
  createdAt?: Date;
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
  maintenanceWindows?: Iterable<MaintenanceWindow>;
  maintenanceReason?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Room Aggregate Root controlling spatial availability, capacity bounds, facility features,
 * and scheduled temporal maintenance windows.
 *
 * Implements SchedulableResource capability port for unified resource scheduling.
 * Invariant: Room reservations never mutate the Room aggregate root. Mutations occur
 * strictly on operational status, capacity, features, or maintenance windows.
 */
export class Room implements SchedulableResource<RoomId>, AggregateRoot<RoomId> {
  private readonly _id: RoomId;
  private _version: number;
  private _name: string;
  private _capacity: number;
  private _status: RoomStatus;
  private readonly _features: Set<string>;
  private readonly _maintenanceWindows: Map<string, MaintenanceWindow> = new Map();
  private _maintenanceReason?: string;
  private readonly _createdAt: Date;
  private _updatedAt: Date;
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
    if (props.maintenanceWindows) {
      for (const win of props.maintenanceWindows) {
        this._maintenanceWindows.set(win.id, win);
      }
    }
    this._maintenanceReason = props.maintenanceReason;
    this._createdAt = props.createdAt ?? new Date();
    this._updatedAt = props.updatedAt ?? this._createdAt;
  }

  /**
   * Factory method to create a new Room aggregate root and record RoomCreatedEvent.
   *
   * @param props Construction properties for the room
   * @returns Newly initialized Room aggregate with version 1 and default AVAILABLE status
   */
  public static create(props: CreateRoomProps): Room {
    const roomId = props.id ?? RoomId.create();
    const status = props.status ?? RoomStatus.AVAILABLE;
    const createdAt = props.createdAt ?? new Date();

    const room = new Room({
      id: roomId,
      version: 1,
      name: props.name,
      capacity: props.capacity,
      status,
      features: props.features ?? [],
      maintenanceWindows: props.maintenanceWindows ?? [],
      createdAt,
      updatedAt: createdAt,
    });

    room.recordEvent(
      new RoomCreatedEvent(
        roomId.getValue(),
        room.name,
        room.capacity,
        Array.from(room.features),
        1,
        createdAt,
      ),
    );

    return room;
  }

  /**
   * Reconstitutes an existing Room aggregate root from database hydration state without re-emitting creation events.
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

  /** Gets the taxonomy type of this schedulable resource */
  public get resourceType(): ResourceType {
    return ResourceType.ROOM;
  }

  /** Gets the maximum client capacity of the room */
  public get capacity(): number {
    return this._capacity;
  }

  /** Gets the current operational status of the room */
  public get status(): RoomStatus {
    return this._status;
  }

  /**
   * Evaluates if the room is currently reservable for scheduling.
   *
   * @returns true if status is AVAILABLE, false otherwise
   */
  public isReservable(): boolean {
    return this._status === RoomStatus.AVAILABLE;
  }

  /** Gets a read-only copy of the room's feature capabilities */
  public get features(): ReadonlySet<string> {
    return new Set(this._features);
  }

  /** Gets a read-only array of scheduled maintenance windows */
  public get maintenanceWindows(): ReadonlyArray<MaintenanceWindow> {
    return Array.from(this._maintenanceWindows.values());
  }

  /** Gets the maintenance reason if currently in MAINTENANCE or UNAVAILABLE status */
  public get maintenanceReason(): string | undefined {
    return this._maintenanceReason;
  }

  /** Gets the aggregate creation timestamp */
  public get createdAt(): Date {
    return this._createdAt;
  }

  /** Gets the aggregate last update timestamp */
  public get updatedAt(): Date {
    return this._updatedAt;
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
    const cleanName = newName.trim();
    if (this._name !== cleanName) {
      this._name = cleanName;
      this._version += 1;
      this._updatedAt = new Date();
    }
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
    if (this._capacity !== newCapacity) {
      this._capacity = newCapacity;
      this._version += 1;
      this._updatedAt = new Date();
    }
  }

  /**
   * Places the room under indefinite MAINTENANCE status with an explanation reason and emits RoomMarkedMaintenanceEvent.
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
    this._updatedAt = new Date();

    this.recordEvent(
      new RoomMarkedMaintenanceEvent(
        this._id.getValue(),
        this._version,
        this._maintenanceReason,
        this._updatedAt,
      ),
    );
  }

  /**
   * Activates the room (status = AVAILABLE), clears maintenance explanations, and records RoomActivatedEvent.
   */
  public activate(): void {
    if (this._status === RoomStatus.AVAILABLE) {
      return; // Already active, idempotent
    }
    this._status = RoomStatus.AVAILABLE;
    this._maintenanceReason = undefined;
    this._version += 1;
    this._updatedAt = new Date();

    this.recordEvent(new RoomActivatedEvent(this._id.getValue(), this._version, this._updatedAt));
  }

  /**
   * Alias to activate() for backward-compatible lifecycle marking.
   */
  public markAvailable(): void {
    this.activate();
  }

  /**
   * Deactivates the room (status = UNAVAILABLE), records reason, and emits RoomDeactivatedEvent.
   *
   * @param reason Optional deactivation reason
   */
  public deactivate(reason?: string): void {
    const cleanReason = reason ? reason.trim() : undefined;
    if (this._status === RoomStatus.UNAVAILABLE && this._maintenanceReason === cleanReason) {
      return; // Already in exact state, idempotent
    }
    this._status = RoomStatus.UNAVAILABLE;
    this._maintenanceReason = cleanReason;
    this._version += 1;
    this._updatedAt = new Date();

    this.recordEvent(
      new RoomDeactivatedEvent(
        this._id.getValue(),
        this._version,
        this._maintenanceReason,
        this._updatedAt,
      ),
    );
  }

  /**
   * Alias to deactivate() for backward-compatible lifecycle marking.
   *
   * @param reason Optional unavailability explanation
   */
  public markUnavailable(reason?: string): void {
    this.deactivate(reason);
  }

  /**
   * Schedules a time-ranged maintenance window on the room and records RoomMaintenanceScheduledEvent.
   *
   * @param props Maintenance window parameters
   * @returns Newly scheduled MaintenanceWindow value object
   */
  public scheduleMaintenance(props: CreateMaintenanceWindowProps): MaintenanceWindow {
    const window = MaintenanceWindow.create(props);
    this._maintenanceWindows.set(window.id, window);
    this._version += 1;
    this._updatedAt = new Date();

    this.recordEvent(
      new RoomMaintenanceScheduledEvent(
        this._id.getValue(),
        window.id,
        window.timeRange,
        window.reason,
        this._version,
        this._updatedAt,
      ),
    );

    return window;
  }

  /**
   * Cancels/removes a scheduled maintenance window by identifier and records RoomMaintenanceCancelledEvent.
   *
   * @param maintenanceId Identifier of the maintenance window
   * @returns True if window was found and removed, false otherwise
   */
  public cancelMaintenance(maintenanceId: string): boolean {
    if (!this._maintenanceWindows.has(maintenanceId)) {
      return false;
    }
    this._maintenanceWindows.delete(maintenanceId);
    this._version += 1;
    this._updatedAt = new Date();

    this.recordEvent(
      new RoomMaintenanceCancelledEvent(
        this._id.getValue(),
        maintenanceId,
        this._version,
        this._updatedAt,
      ),
    );

    return true;
  }

  /**
   * Evaluates if the room is blocked by maintenance (either indefinite status or overlapping maintenance window).
   *
   * @param targetRange Candidate booking time range
   * @param buffer Optional turnaround buffer applied to target range
   * @returns True if maintenance blocks the requested range
   */
  public isUnderMaintenance(targetRange: TimeRange, buffer?: TurnaroundBuffer): boolean {
    if (this._status === RoomStatus.MAINTENANCE) {
      return true;
    }
    for (const window of this._maintenanceWindows.values()) {
      if (window.overlaps(targetRange, buffer)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Retrieves any maintenance window overlapping the candidate range, or null if clear.
   *
   * @param targetRange Candidate booking time range
   * @param buffer Optional turnaround buffer
   */
  public getOverlappingMaintenance(
    targetRange: TimeRange,
    buffer?: TurnaroundBuffer,
  ): MaintenanceWindow | null {
    for (const window of this._maintenanceWindows.values()) {
      if (window.overlaps(targetRange, buffer)) {
        return window;
      }
    }
    return null;
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
      this._updatedAt = new Date();
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
      this._updatedAt = new Date();
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
   * Updates room details (name, capacity, features) in a single atomic aggregate mutation.
   */
  public updateDetails(props: {
    name?: string;
    capacity?: number;
    features?: Iterable<string>;
  }): void {
    let changed = false;
    if (props.name !== undefined) {
      if (!props.name || props.name.trim().length === 0) {
        throw new Error('New room name cannot be empty.');
      }
      const cleanName = props.name.trim();
      if (this._name !== cleanName) {
        this._name = cleanName;
        changed = true;
      }
    }
    if (props.capacity !== undefined) {
      if (!Number.isInteger(props.capacity) || props.capacity <= 0) {
        throw new Error('Room capacity must be a positive integer strictly greater than zero.');
      }
      if (this._capacity !== props.capacity) {
        this._capacity = props.capacity;
        changed = true;
      }
    }
    if (props.features !== undefined) {
      const newFeatures = new Set(Array.from(props.features).map((f) => f.trim().toLowerCase()));
      const featuresChanged =
        newFeatures.size !== this._features.size ||
        Array.from(newFeatures).some((f) => !this._features.has(f));
      if (featuresChanged) {
        this._features.clear();
        for (const f of newFeatures) {
          this._features.add(f);
        }
        changed = true;
      }
    }

    if (changed) {
      this._version += 1;
      this._updatedAt = new Date();
    }
  }

  /**
   * Records a domain event on this aggregate root.
   */
  private recordEvent(event: DomainEvent): void {
    this.uncommittedEvents.push(event);
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
