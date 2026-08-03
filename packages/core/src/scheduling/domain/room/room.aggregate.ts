import { AggregateRoot } from '../shared/aggregate-root';
import { DomainEvent } from '../shared/domain-event';
import { RoomId } from './room-id.vo';
import { RoomStatus } from '../value-objects/room-status.enum';

export interface CreateRoomProps {
  id?: RoomId;
  name: string;
  capacity: number;
  status?: RoomStatus;
  features?: Iterable<string>;
}

export interface ReconstituteRoomProps {
  id: RoomId;
  version: number;
  name: string;
  capacity: number;
  status: RoomStatus;
  features: Iterable<string>;
  maintenanceReason?: string;
}

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
    this._features = new Set(props.features);
    this._maintenanceReason = props.maintenanceReason;
  }

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

  public static reconstitute(props: ReconstituteRoomProps): Room {
    return new Room(props);
  }

  // Getters
  public get id(): RoomId {
    return this._id;
  }

  public get version(): number {
    return this._version;
  }

  public get name(): string {
    return this._name;
  }

  public get capacity(): number {
    return this._capacity;
  }

  public get status(): RoomStatus {
    return this._status;
  }

  public get features(): ReadonlySet<string> {
    return new Set(this._features);
  }

  public get maintenanceReason(): string | undefined {
    return this._maintenanceReason;
  }

  // Behaviors
  public rename(newName: string): void {
    if (!newName || newName.trim().length === 0) {
      throw new Error('New room name cannot be empty.');
    }
    this._name = newName.trim();
    this._version += 1;
  }

  public changeCapacity(newCapacity: number): void {
    if (!Number.isInteger(newCapacity) || newCapacity <= 0) {
      throw new Error('Room capacity must be a positive integer strictly greater than zero.');
    }
    this._capacity = newCapacity;
    this._version += 1;
  }

  public markMaintenance(reason: string): void {
    if (!reason || reason.trim().length === 0) {
      throw new Error('Maintenance reason is required.');
    }
    this._status = RoomStatus.MAINTENANCE;
    this._maintenanceReason = reason.trim();
    this._version += 1;
  }

  public markAvailable(): void {
    this._status = RoomStatus.AVAILABLE;
    this._maintenanceReason = undefined;
    this._version += 1;
  }

  public markUnavailable(reason?: string): void {
    this._status = RoomStatus.UNAVAILABLE;
    this._maintenanceReason = reason ? reason.trim() : undefined;
    this._version += 1;
  }

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

  public supportsFeatures(requiredFeatures: string[]): boolean {
    if (!requiredFeatures || requiredFeatures.length === 0) {
      return true;
    }
    return requiredFeatures.every((feat) => this._features.has(feat.trim().toLowerCase()));
  }

  // Event Store Operations
  public getUncommittedEvents(): ReadonlyArray<DomainEvent> {
    return Object.freeze([...this.uncommittedEvents]);
  }

  public clearEvents(): void {
    this.uncommittedEvents = [];
  }

  public pullEvents(): ReadonlyArray<DomainEvent> {
    const events = [...this.uncommittedEvents];
    this.uncommittedEvents = [];
    return Object.freeze(events);
  }
}
