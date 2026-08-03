import { AggregateRoot } from '../shared/aggregate-root';
import { DomainEvent } from '../shared/domain-event';
import { AppointmentId } from './appointment-id.vo';
import { AppointmentType } from '../value-objects/appointment-type.vo';
import { TimeRange } from '../value-objects/time-range.vo';
import { AppointmentStatus } from '../value-objects/appointment-status.enum';
import { Clock } from '../shared/clock';
import { InvalidAppointmentTransitionException } from '../exceptions/invalid-appointment-transition.exception';
import { AppointmentNote } from './value-objects/appointment-note.vo';

// Domain Events
import { AppointmentCreatedEvent } from '../events/appointment-created.event';
import { AppointmentCancelledEvent } from '../events/appointment-cancelled.event';
import { AppointmentRescheduledEvent } from '../events/appointment-rescheduled.event';
import { AppointmentCheckedInEvent } from '../events/appointment-checked-in.event';
import { AppointmentCompletedEvent } from '../events/appointment-completed.event';
import { AppointmentNoShowEvent } from '../events/appointment-no-show.event';
import { RoomAssignedEvent } from '../events/room-assigned.event';
import { TherapistAssignedEvent } from '../events/therapist-assigned.event';

/** Properties required to create a new Appointment aggregate */
export interface CreateAppointmentProps {
  id?: AppointmentId;
  clientId: string;
  therapistId: string;
  roomId: string;
  type: AppointmentType;
  timeRange: TimeRange;
  notes?: AppointmentNote[];
}

/** Properties required to reconstitute an Appointment aggregate from persistence */
export interface ReconstituteAppointmentProps {
  id: AppointmentId;
  version: number;
  status: AppointmentStatus;
  type: AppointmentType;
  clientId: string;
  therapistId: string;
  roomId: string;
  timeRange: TimeRange;
  cancellationReason?: string;
  notes?: AppointmentNote[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Appointment Aggregate Root enforcing state machine transitions, domain event recording,
 * notes management, and optimistic concurrency version control.
 */
export class Appointment implements AggregateRoot<AppointmentId> {
  private readonly _id: AppointmentId;
  private _version: number;
  private _status: AppointmentStatus;
  private _type: AppointmentType;
  private readonly _clientId: string;
  private _therapistId: string;
  private _roomId: string;
  private _timeRange: TimeRange;
  private _cancellationReason?: string;
  private _notes: AppointmentNote[];
  private readonly _createdAt: Date;
  private _updatedAt: Date;
  private uncommittedEvents: DomainEvent[] = [];

  private constructor(props: ReconstituteAppointmentProps) {
    if (!props.clientId || props.clientId.trim().length === 0) {
      throw new Error('Client ID cannot be empty.');
    }
    if (!props.therapistId || props.therapistId.trim().length === 0) {
      throw new Error('Therapist ID cannot be empty.');
    }
    if (!props.roomId || props.roomId.trim().length === 0) {
      throw new Error('Room ID cannot be empty.');
    }

    this._id = props.id;
    this._version = props.version;
    this._status = props.status;
    this._type = props.type;
    this._clientId = props.clientId.trim();
    this._therapistId = props.therapistId.trim();
    this._roomId = props.roomId.trim();
    this._timeRange = props.timeRange;
    this._cancellationReason = props.cancellationReason;
    this._notes = props.notes ? [...props.notes] : [];
    this._createdAt = props.createdAt;
    this._updatedAt = props.updatedAt;
  }

  /**
   * Factory method to create a new Appointment in SCHEDULED status and record AppointmentCreatedEvent.
   */
  public static create(props: CreateAppointmentProps, clock?: Clock): Appointment {
    const apptId = props.id ?? AppointmentId.create();
    const now = clock ? clock.now() : new Date();

    const appointment = new Appointment({
      id: apptId,
      version: 1,
      status: AppointmentStatus.SCHEDULED,
      type: props.type,
      clientId: props.clientId,
      therapistId: props.therapistId,
      roomId: props.roomId,
      timeRange: props.timeRange,
      notes: props.notes ?? [],
      createdAt: now,
      updatedAt: now,
    });

    appointment.recordEvent(
      new AppointmentCreatedEvent(
        apptId.getValue(),
        props.clientId,
        props.therapistId,
        props.roomId,
        props.type,
        props.timeRange,
        appointment.version,
        now,
      ),
    );

    return appointment;
  }

  /** Reconstitutes an existing Appointment aggregate from database storage DTO */
  public static reconstitute(props: ReconstituteAppointmentProps): Appointment {
    return new Appointment(props);
  }

  /** Gets the unique AppointmentId */
  public get id(): AppointmentId {
    return this._id;
  }

  /** Gets the optimistic concurrency version counter */
  public get version(): number {
    return this._version;
  }

  /** Gets the current appointment status */
  public get status(): AppointmentStatus {
    return this._status;
  }

  /** Gets the appointment classification type */
  public get type(): AppointmentType {
    return this._type;
  }

  /** Gets the scalar string ID of the client */
  public get clientId(): string {
    return this._clientId;
  }

  /** Gets the scalar string ID of the therapist */
  public get therapistId(): string {
    return this._therapistId;
  }

  /** Gets the scalar string ID of the room */
  public get roomId(): string {
    return this._roomId;
  }

  /** Gets the TimeRange temporal interval */
  public get timeRange(): TimeRange {
    return this._timeRange;
  }

  /** Gets the cancellation reason if in CANCELLED status */
  public get cancellationReason(): string | undefined {
    return this._cancellationReason;
  }

  /** Gets a read-only list of attached AppointmentNote VOs */
  public get notes(): ReadonlyArray<AppointmentNote> {
    return Object.freeze([...this._notes]);
  }

  /** Gets the creation Date timestamp */
  public get createdAt(): Date {
    return new Date(this._createdAt.getTime());
  }

  /** Gets the last updated Date timestamp */
  public get updatedAt(): Date {
    return new Date(this._updatedAt.getTime());
  }

  /** Transitions status from SCHEDULED -> CONFIRMED */
  public confirm(clock?: Clock): void {
    if (this._status !== AppointmentStatus.SCHEDULED) {
      throw new InvalidAppointmentTransitionException(this._status, AppointmentStatus.CONFIRMED);
    }
    this._status = AppointmentStatus.CONFIRMED;
    this.touch(clock);
  }

  /**
   * Transitions status from SCHEDULED or CONFIRMED -> CHECKED_IN.
   * Records AppointmentCheckedInEvent.
   */
  public checkIn(clock?: Clock): void {
    if (
      this._status !== AppointmentStatus.SCHEDULED &&
      this._status !== AppointmentStatus.CONFIRMED
    ) {
      throw new InvalidAppointmentTransitionException(this._status, AppointmentStatus.CHECKED_IN);
    }
    this._status = AppointmentStatus.CHECKED_IN;
    const now = clock ? clock.now() : new Date();
    this.touch(clock);

    this.recordEvent(new AppointmentCheckedInEvent(this._id.getValue(), this._version, now));
  }

  /** Transitions status from CHECKED_IN -> IN_PROGRESS */
  public start(clock?: Clock): void {
    if (this._status !== AppointmentStatus.CHECKED_IN) {
      throw new InvalidAppointmentTransitionException(this._status, AppointmentStatus.IN_PROGRESS);
    }
    this._status = AppointmentStatus.IN_PROGRESS;
    this.touch(clock);
  }

  /**
   * Transitions status from IN_PROGRESS -> COMPLETED.
   * Records AppointmentCompletedEvent.
   */
  public complete(clock?: Clock): void {
    if (this._status !== AppointmentStatus.IN_PROGRESS) {
      throw new InvalidAppointmentTransitionException(this._status, AppointmentStatus.COMPLETED);
    }
    this._status = AppointmentStatus.COMPLETED;
    const now = clock ? clock.now() : new Date();
    this.touch(clock);

    this.recordEvent(new AppointmentCompletedEvent(this._id.getValue(), this._version, now));
  }

  /**
   * Cancels the appointment with a mandatory reason and records AppointmentCancelledEvent.
   */
  public cancel(reason: string, clock?: Clock): void {
    if (!reason || reason.trim().length === 0) {
      throw new Error('Cancellation reason is required.');
    }
    this.assertNonTerminalState('cancel');

    this._status = AppointmentStatus.CANCELLED;
    this._cancellationReason = reason.trim();
    const now = clock ? clock.now() : new Date();
    this.touch(clock);

    this.recordEvent(
      new AppointmentCancelledEvent(
        this._id.getValue(),
        this._cancellationReason,
        this._version,
        now,
      ),
    );
  }

  /**
   * Marks the appointment as NO_SHOW and records AppointmentNoShowEvent.
   * Allowed from SCHEDULED or CONFIRMED status.
   */
  public markNoShow(reason?: string, clock?: Clock): void {
    if (
      this._status !== AppointmentStatus.SCHEDULED &&
      this._status !== AppointmentStatus.CONFIRMED
    ) {
      throw new InvalidAppointmentTransitionException(
        this._status,
        AppointmentStatus.NO_SHOW,
        `Marking NO_SHOW is only allowed for SCHEDULED or CONFIRMED appointments. Current status: '${this._status}'.`,
      );
    }

    this._status = AppointmentStatus.NO_SHOW;
    if (reason && reason.trim().length > 0) {
      this._cancellationReason = reason.trim();
    }
    const now = clock ? clock.now() : new Date();
    this.touch(clock);

    this.recordEvent(
      new AppointmentNoShowEvent(this._id.getValue(), this._cancellationReason, this._version, now),
    );
  }

  /**
   * Reschedules the appointment to a new TimeRange and records AppointmentRescheduledEvent.
   */
  public reschedule(newTimeRange: TimeRange, clock?: Clock): void {
    if (
      this._status !== AppointmentStatus.SCHEDULED &&
      this._status !== AppointmentStatus.CONFIRMED
    ) {
      throw new InvalidAppointmentTransitionException(
        this._status,
        AppointmentStatus.RESCHEDULED,
        `Rescheduling is only allowed for SCHEDULED or CONFIRMED appointments. Current status: '${this._status}'.`,
      );
    }

    const oldRange = this._timeRange;
    this._timeRange = newTimeRange;
    this._status = AppointmentStatus.RESCHEDULED;
    const now = clock ? clock.now() : new Date();
    this.touch(clock);

    this.recordEvent(
      new AppointmentRescheduledEvent(
        this._id.getValue(),
        oldRange,
        newTimeRange,
        this._version,
        now,
      ),
    );
  }

  /** Reassigns room and records RoomAssignedEvent */
  public assignRoom(newRoomId: string, clock?: Clock): void {
    if (!newRoomId || newRoomId.trim().length === 0) {
      throw new Error('Room ID cannot be empty.');
    }
    this.assertNonTerminalState('assign room');

    const oldRoomId = this._roomId;
    this._roomId = newRoomId.trim();
    const now = clock ? clock.now() : new Date();
    this.touch(clock);

    this.recordEvent(
      new RoomAssignedEvent(this._id.getValue(), oldRoomId, this._roomId, this._version, now),
    );
  }

  /** Reassigns therapist and records TherapistAssignedEvent */
  public assignTherapist(newTherapistId: string, clock?: Clock): void {
    if (!newTherapistId || newTherapistId.trim().length === 0) {
      throw new Error('Therapist ID cannot be empty.');
    }
    this.assertNonTerminalState('assign therapist');

    const oldTherapistId = this._therapistId;
    this._therapistId = newTherapistId.trim();
    const now = clock ? clock.now() : new Date();
    this.touch(clock);

    this.recordEvent(
      new TherapistAssignedEvent(
        this._id.getValue(),
        oldTherapistId,
        this._therapistId,
        this._version,
        now,
      ),
    );
  }

  /**
   * Appends an immutable AppointmentNote VO to the appointment.
   * Asserts non-terminal state and bumps version counter.
   *
   * @param authorId User ID of author
   * @param content Note content text
   * @param clock Optional Clock abstraction
   */
  public addNote(authorId: string, content: string, clock?: Clock): void {
    this.assertNonTerminalState('add note');
    const now = clock ? clock.now() : new Date();
    const note = AppointmentNote.create(authorId, content, now);

    this._notes.push(note);
    this.touch(clock);
  }

  /** Gets uncommitted domain events */
  public getUncommittedEvents(): ReadonlyArray<DomainEvent> {
    return Object.freeze([...this.uncommittedEvents]);
  }

  /** Clears uncommitted domain events */
  public clearEvents(): void {
    this.uncommittedEvents = [];
  }

  /** Atomically pulls and clears uncommitted domain events */
  public pullEvents(): ReadonlyArray<DomainEvent> {
    const events = [...this.uncommittedEvents];
    this.uncommittedEvents = [];
    return Object.freeze(events);
  }

  private touch(clock?: Clock): void {
    this._updatedAt = clock ? clock.now() : new Date();
    this._version += 1;
  }

  private recordEvent(event: DomainEvent): void {
    this.uncommittedEvents.push(event);
  }

  private assertNonTerminalState(actionName: string): void {
    if (
      this._status === AppointmentStatus.COMPLETED ||
      this._status === AppointmentStatus.CANCELLED ||
      this._status === AppointmentStatus.NO_SHOW
    ) {
      throw new InvalidAppointmentTransitionException(
        this._status,
        'TERMINAL',
        `Cannot ${actionName} for appointment in terminal '${this._status}' status.`,
      );
    }
  }
}
