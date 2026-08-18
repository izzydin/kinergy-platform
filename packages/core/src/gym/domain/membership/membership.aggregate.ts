import { AggregateRoot } from '../shared/aggregate-root';
import { DomainEvent } from '../shared/domain-event';
import { Clock } from '../shared/clock';
import { MembershipId } from './membership-id.vo';
import { MembershipStatus } from './membership-status.enum';
import { MembershipPeriod } from './membership-period.vo';
import { FreezeWindow } from './freeze-window.vo';
import { TrainerAssignment } from './trainer-assignment.vo';
import { InvalidMembershipTransitionException } from '../exceptions/invalid-membership-transition.exception';
import {
  MembershipCreatedEvent,
  MembershipActivatedEvent,
  MembershipFrozenEvent,
  MembershipUnfrozenEvent,
  MembershipRenewedEvent,
  MembershipExpiredEvent,
  MembershipCancelledEvent,
  MembershipTerminatedEvent,
} from '../events';

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

    const membership = new Membership({
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

    membership.recordEvent(
      new MembershipCreatedEvent(
        membership.id.value,
        membership.clientId,
        membership.planId,
        membership.period.startDate,
        membership.period.endDate,
        membership.status,
        membership.version,
        now,
      ),
    );

    return membership;
  }

  /**
   * Reconstitutes an existing Membership aggregate from persistence data
   * without emitting uncommitted domain events.
   */
  public static reconstitute(props: ReconstituteMembershipProps): Membership {
    return new Membership(props);
  }

  // =========================================================================
  // Deterministic Lifecycle State Machine Operations (Phase 5.2-C)
  // =========================================================================

  /**
   * Activates a pending membership.
   * Transitions: PENDING -> ACTIVE
   */
  public activate(clock?: Clock): void {
    if (this._status !== MembershipStatus.PENDING) {
      throw new InvalidMembershipTransitionException(
        this._status,
        MembershipStatus.ACTIVE,
        'Only PENDING memberships can be activated.',
      );
    }
    this._status = MembershipStatus.ACTIVE;
    this._version++;
    const now = clock ? clock.now() : new Date();
    this.touch(clock);
    this.recordEvent(
      new MembershipActivatedEvent(
        this._id.value,
        this._clientId,
        this._planId,
        this._version,
        now,
      ),
    );
  }

  /**
   * Freezes an active membership, capturing a freeze window.
   * Transitions: ACTIVE -> FROZEN
   */
  public freeze(window: FreezeWindow, clock?: Clock): void {
    if (this._status !== MembershipStatus.ACTIVE) {
      throw new InvalidMembershipTransitionException(
        this._status,
        MembershipStatus.FROZEN,
        'Only ACTIVE memberships can be frozen.',
      );
    }
    if (!window) {
      throw new Error('Freeze window cannot be null or undefined.');
    }
    this._freezeHistory.push(window);
    this._status = MembershipStatus.FROZEN;
    this._version++;
    const now = clock ? clock.now() : new Date();
    this.touch(clock);
    this.recordEvent(
      new MembershipFrozenEvent(
        this._id.value,
        this._clientId,
        window.startDate,
        window.endDate,
        window.reason,
        this._version,
        now,
      ),
    );
  }

  /**
   * Resumes a frozen membership, extending the expiration date by the freeze duration.
   * Transitions: FROZEN -> ACTIVE
   */
  public unfreeze(clock?: Clock): void {
    if (this._status !== MembershipStatus.FROZEN) {
      throw new InvalidMembershipTransitionException(
        this._status,
        MembershipStatus.ACTIVE,
        'Only FROZEN memberships can be resumed/unfrozen.',
      );
    }
    if (this._freezeHistory.length === 0) {
      throw new Error('No freeze window found in freeze history to resume from.');
    }

    const latestFreeze = this._freezeHistory[this._freezeHistory.length - 1]!;
    const durationDays = latestFreeze.durationDays;
    if (durationDays > 0) {
      this._period = this._period.extend(durationDays);
    }

    this._status = MembershipStatus.ACTIVE;
    this._version++;
    const now = clock ? clock.now() : new Date();
    this.touch(clock);
    this.recordEvent(
      new MembershipUnfrozenEvent(
        this._id.value,
        this._clientId,
        this._period.endDate,
        durationDays,
        this._version,
        now,
      ),
    );
  }

  /**
   * Transitions an active or frozen membership to expired status upon reaching end date.
   * Transitions: ACTIVE -> EXPIRED, FROZEN -> EXPIRED
   */
  public expire(clock?: Clock): void {
    if (this._status !== MembershipStatus.ACTIVE && this._status !== MembershipStatus.FROZEN) {
      throw new InvalidMembershipTransitionException(
        this._status,
        MembershipStatus.EXPIRED,
        'Only ACTIVE or FROZEN memberships can expire.',
      );
    }
    this._status = MembershipStatus.EXPIRED;
    this._version++;
    const now = clock ? clock.now() : new Date();
    this.touch(clock);
    this.recordEvent(
      new MembershipExpiredEvent(this._id.value, this._clientId, this._planId, this._version, now),
    );
  }

  /**
   * Renews a membership in accordance with ADR-0061 temporal semantics.
   * If ACTIVE and now <= endDate: extends period gaplessly from existing endDate (preserves 100% unused time).
   * If ACTIVE and now > endDate (late renewal): establishes new period from effective now.
   * If EXPIRED: establishes new period and re-activates agreement to ACTIVE (no gap fees).
   * Transitions: ACTIVE -> ACTIVE, EXPIRED -> ACTIVE
   */
  public renew(additionalPeriod: MembershipPeriod, clock?: Clock, newPlanId?: string): void {
    if (this._status !== MembershipStatus.ACTIVE && this._status !== MembershipStatus.EXPIRED) {
      throw new InvalidMembershipTransitionException(
        this._status,
        MembershipStatus.ACTIVE,
        'Only ACTIVE or EXPIRED memberships can be renewed.',
      );
    }
    if (!additionalPeriod) {
      throw new Error('Additional renewal period must be provided.');
    }

    const now = clock ? clock.now() : new Date();

    if (this._status === MembershipStatus.ACTIVE) {
      if (now.getTime() > this._period.endDate.getTime()) {
        // Late renewal: current status is ACTIVE but passage of time is past endDate
        this._period = additionalPeriod;
      } else {
        // Early or boundary renewal: extend seamlessly from current endDate
        this._period = this._period.extend(additionalPeriod.durationDays);
      }
    } else {
      // Lapsed renewal: re-activate agreement from effective payment period
      this._period = additionalPeriod;
      this._status = MembershipStatus.ACTIVE;
    }

    if (newPlanId && newPlanId.trim().length > 0) {
      this._planId = newPlanId.trim();
    }

    this._version++;
    this.touch(clock);
    this.recordEvent(
      new MembershipRenewedEvent(
        this._id.value,
        this._clientId,
        this._planId,
        this._period.startDate,
        this._period.endDate,
        this._version,
        now,
      ),
    );
  }

  /**
   * Cancels a membership upon voluntary agreement termination.
   * Transitions: PENDING -> CANCELLED, ACTIVE -> CANCELLED, FROZEN -> CANCELLED
   */
  public cancel(reason?: string, clock?: Clock): void {
    if (
      this._status !== MembershipStatus.PENDING &&
      this._status !== MembershipStatus.ACTIVE &&
      this._status !== MembershipStatus.FROZEN
    ) {
      throw new InvalidMembershipTransitionException(
        this._status,
        MembershipStatus.CANCELLED,
        `Cannot cancel membership from '${this._status}' status.`,
      );
    }
    this._status = MembershipStatus.CANCELLED;
    this._cancellationReason = reason?.trim() || undefined;
    this._version++;
    const now = clock ? clock.now() : new Date();
    this.touch(clock);
    this.recordEvent(
      new MembershipCancelledEvent(
        this._id.value,
        this._clientId,
        this._planId,
        this._cancellationReason,
        this._version,
        now,
      ),
    );
  }

  /**
   * Irrevocably terminates a membership due to fraud, policy breach, or account archival.
   * Transitions: PENDING, ACTIVE, FROZEN, EXPIRED, CANCELLED -> TERMINATED
   */
  public terminate(reason?: string, clock?: Clock): void {
    if (this._status === MembershipStatus.TERMINATED) {
      throw new InvalidMembershipTransitionException(
        this._status,
        MembershipStatus.TERMINATED,
        'Membership is already irrevocably terminated.',
      );
    }
    this._status = MembershipStatus.TERMINATED;
    this._terminationReason = reason?.trim() || undefined;
    this._version++;
    const now = clock ? clock.now() : new Date();
    this.touch(clock);
    this.recordEvent(
      new MembershipTerminatedEvent(
        this._id.value,
        this._clientId,
        this._planId,
        this._terminationReason,
        this._version,
        now,
      ),
    );
  }

  /**
   * Assigns an operational fitness trainer to this membership.
   */
  public assignTrainer(trainerId: string, clock?: Clock): void {
    if (
      this._status === MembershipStatus.TERMINATED ||
      this._status === MembershipStatus.CANCELLED
    ) {
      throw new Error(
        `Cannot assign trainer to a membership in '${this._status}' terminal status.`,
      );
    }
    if (!trainerId || trainerId.trim().length === 0) {
      throw new Error('Trainer ID cannot be empty.');
    }
    const now = clock ? clock.now() : new Date();
    this._trainerAssignment = TrainerAssignment.create(trainerId.trim(), now);
    this._version++;
    this.touch(clock);
  }

  /**
   * Removes the assigned operational trainer from this membership.
   */
  public removeTrainer(clock?: Clock): void {
    if (
      this._status === MembershipStatus.TERMINATED ||
      this._status === MembershipStatus.CANCELLED
    ) {
      throw new Error(
        `Cannot remove trainer from a membership in '${this._status}' terminal status.`,
      );
    }
    this._trainerAssignment = null;
    this._version++;
    this.touch(clock);
  }

  /**
   * Changes the associated MembershipPlan catalog template.
   */
  public changePlan(newPlanId: string, clock?: Clock): void {
    if (
      this._status === MembershipStatus.TERMINATED ||
      this._status === MembershipStatus.CANCELLED
    ) {
      throw new Error(`Cannot change plan for a membership in '${this._status}' terminal status.`);
    }
    if (!newPlanId || newPlanId.trim().length === 0) {
      throw new Error('New Plan ID cannot be empty.');
    }
    this._planId = newPlanId.trim();
    this._version++;
    this.touch(clock);
  }

  // =========================================================================
  // Query Helpers & Encapsulated State Getters
  // =========================================================================

  public isPending(): boolean {
    return this._status === MembershipStatus.PENDING;
  }

  public isActive(): boolean {
    return this._status === MembershipStatus.ACTIVE;
  }

  public isFrozen(): boolean {
    return this._status === MembershipStatus.FROZEN;
  }

  public isExpired(): boolean {
    return this._status === MembershipStatus.EXPIRED;
  }

  public isCancelled(): boolean {
    return this._status === MembershipStatus.CANCELLED;
  }

  public isTerminated(): boolean {
    return this._status === MembershipStatus.TERMINATED;
  }

  /**
   * Evaluates whether the membership is currently on freeze at the given instant.
   */
  public isCurrentlyFrozen(atDate: Date = new Date()): boolean {
    if (this._status === MembershipStatus.FROZEN) {
      return true;
    }
    return this._freezeHistory.some((f) => f.contains(atDate));
  }

  /**
   * Determines whether the membership is currently eligible for facility attendance / check-in.
   * Business invariant: Only ACTIVE status memberships without an active freeze
   * and within their validity period are eligible.
   */
  public isEligibleForAttendance(atDate: Date = new Date()): boolean {
    if (this._status !== MembershipStatus.ACTIVE) {
      return false;
    }
    if (this.isCurrentlyFrozen(atDate)) {
      return false;
    }
    return this._period.contains(atDate);
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

  /** Clears all uncommitted domain events (standard alias) */
  public clearUncommittedEvents(): void {
    this.clearEvents();
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
