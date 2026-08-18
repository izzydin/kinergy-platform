import { AggregateRoot } from '../shared/aggregate-root';
import { DomainEvent } from '../shared/domain-event';
import { Clock } from '../shared/clock';
import { MembershipId } from './membership-id.vo';
import { MembershipStatus } from './membership-status.enum';
import { MembershipPeriod } from './membership-period.vo';
import { FreezeWindow } from './freeze-window.vo';
import { TrainerAssignment } from './trainer-assignment.vo';

/**
 * Properties required to create a new Membership aggregate root.
 */
export interface CreateMembershipProps {
  id?: MembershipId;
  clientId: string;
  planId: string;
  period: MembershipPeriod;
  status?: MembershipStatus;
  trainerAssignment?: TrainerAssignment | null;
}

/**
 * Properties required to reconstitute an existing Membership aggregate root from persistence.
 */
export interface ReconstituteMembershipProps {
  id: MembershipId;
  version: number;
  status: MembershipStatus;
  clientId: string;
  planId: string;
  period: MembershipPeriod;
  freezeHistory?: FreezeWindow[];
  trainerAssignment?: TrainerAssignment | null;
  cancellationReason?: string;
  terminationReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Membership Aggregate Root governing gym membership agreements,
 * lifecycle state transitions, validity periods, freeze history,
 * and trainer assignments.
 */
export class Membership implements AggregateRoot<MembershipId> {
  private readonly _id: MembershipId;
  private _version: number;
  private _status: MembershipStatus;
  private readonly _clientId: string;
  private _planId: string;
  private _period: MembershipPeriod;
  private _freezeHistory: FreezeWindow[];
  private _trainerAssignment: TrainerAssignment | null;
  private _cancellationReason?: string;
  private _terminationReason?: string;
  private readonly _createdAt: Date;
  private _updatedAt: Date;
  private uncommittedEvents: DomainEvent[] = [];

  private constructor(props: ReconstituteMembershipProps) {
    if (!props.id) {
      throw new Error('Membership ID cannot be empty.');
    }
    if (!props.clientId || props.clientId.trim().length === 0) {
      throw new Error('Client ID cannot be empty.');
    }
    if (!props.planId || props.planId.trim().length === 0) {
      throw new Error('Plan ID cannot be empty.');
    }
    if (!props.period) {
      throw new Error('Membership period cannot be null or undefined.');
    }
    if (!props.status || !Object.values(MembershipStatus).includes(props.status)) {
      throw new Error(`Invalid MembershipStatus: '${props.status}'.`);
    }
    if (!props.createdAt || !props.updatedAt) {
      throw new Error('Membership timestamps must be provided.');
    }
    if (props.version < 1) {
      throw new Error('Aggregate version must be greater than or equal to 1.');
    }

    this._id = props.id;
    this._version = props.version;
    this._status = props.status;
    this._clientId = props.clientId.trim();
    this._planId = props.planId.trim();
    this._period = props.period;
    this._freezeHistory = props.freezeHistory ? [...props.freezeHistory] : [];
    this._trainerAssignment = props.trainerAssignment ?? null;
    this._cancellationReason = props.cancellationReason?.trim() || undefined;
    this._terminationReason = props.terminationReason?.trim() || undefined;
    this._createdAt = new Date(props.createdAt.getTime());
    this._updatedAt = new Date(props.updatedAt.getTime());
  }

  /**
   * Factory method to safely create a new Membership aggregate.
   * Derives initial status (PENDING if future startDate, else ACTIVE or explicit).
   */
  public static create(props: CreateMembershipProps, clock?: Clock): Membership {
    const membershipId = props.id ?? MembershipId.create();
    const now = clock ? clock.now() : new Date();

    let initialStatus = props.status;
    if (!initialStatus) {
      initialStatus =
        props.period.startDate.getTime() > now.getTime()
          ? MembershipStatus.PENDING
          : MembershipStatus.ACTIVE;
    }

    return new Membership({
      id: membershipId,
      version: 1,
      status: initialStatus,
      clientId: props.clientId,
      planId: props.planId,
      period: props.period,
      freezeHistory: [],
      trainerAssignment: props.trainerAssignment ?? null,
      createdAt: now,
      updatedAt: now,
    });
  }

  /**
   * Reconstitutes an existing Membership aggregate from persistence data
   * without emitting uncommitted domain events.
   */
  public static reconstitute(props: ReconstituteMembershipProps): Membership {
    return new Membership(props);
  }

  /** Unique aggregate identifier */
  public get id(): MembershipId {
    return this._id;
  }

  /** Optimistic concurrency version */
  public get version(): number {
    return this._version;
  }

  /** Current membership lifecycle status */
  public get status(): MembershipStatus {
    return this._status;
  }

  /** Associated Client identifier */
  public get clientId(): string {
    return this._clientId;
  }

  /** Associated MembershipPlan identifier */
  public get planId(): string {
    return this._planId;
  }

  /** Validity period of the membership */
  public get period(): MembershipPeriod {
    return this._period;
  }

  /** Freeze history windows (defensive copy) */
  public get freezeHistory(): ReadonlyArray<FreezeWindow> {
    return [...this._freezeHistory];
  }

  /** Operational trainer assignment if any */
  public get trainerAssignment(): TrainerAssignment | null {
    return this._trainerAssignment;
  }

  /** Voluntary cancellation reason */
  public get cancellationReason(): string | undefined {
    return this._cancellationReason;
  }

  /** Involuntary termination reason */
  public get terminationReason(): string | undefined {
    return this._terminationReason;
  }

  /** Creation timestamp (defensive copy) */
  public get createdAt(): Date {
    return new Date(this._createdAt.getTime());
  }

  /** Last update timestamp (defensive copy) */
  public get updatedAt(): Date {
    return new Date(this._updatedAt.getTime());
  }

  /** Returns all uncommitted domain events */
  public getUncommittedEvents(): ReadonlyArray<DomainEvent> {
    return [...this.uncommittedEvents];
  }

  /** Clears all uncommitted domain events */
  public clearEvents(): void {
    this.uncommittedEvents = [];
  }

  /** Pulls and clears all uncommitted domain events */
  public pullEvents(): ReadonlyArray<DomainEvent> {
    const events = [...this.uncommittedEvents];
    this.uncommittedEvents = [];
    return events;
  }

  /** Internal helper to record domain events */
  protected recordEvent(event: DomainEvent): void {
    this.uncommittedEvents.push(event);
  }

  /** Internal helper to touch updatedAt timestamp */
  protected touch(clock?: Clock): void {
    this._updatedAt = clock ? clock.now() : new Date();
  }
}
