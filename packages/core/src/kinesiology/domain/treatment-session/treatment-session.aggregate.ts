import { AggregateRoot } from '../shared/aggregate-root';
import { DomainEvent } from '../shared/domain-event';
import { Clock } from '../shared/clock';
import { SessionId } from './session-id.vo';
import { SessionStatus } from './session-status.enum';
import { SessionNotes } from './session-notes.vo';
import { InvalidSessionTransitionException } from '../exceptions/invalid-session-transition.exception';

// Domain Events
import {
  TreatmentSessionCreatedEvent,
  TreatmentSessionStartedEvent,
  TreatmentSessionCompletedEvent,
  TreatmentSessionCancelledEvent,
  TreatmentSessionNoShowEvent,
  TreatmentSessionNotesUpdatedEvent,
  TherapistAssignedToSessionEvent,
} from '../events';

/** Properties required to create a new TreatmentSession aggregate */
export interface CreateTreatmentSessionProps {
  id?: SessionId;
  clientId: string;
  therapistId: string;
  appointmentId: string;
  notes?: SessionNotes;
}

/** Properties required to reconstitute a TreatmentSession aggregate from persistence */
export interface ReconstituteTreatmentSessionProps {
  id: SessionId;
  version: number;
  status: SessionStatus;
  clientId: string;
  therapistId: string;
  appointmentId: string;
  cancellationReason?: string;
  notes: SessionNotes;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * TreatmentSession Aggregate Root governing clinical therapy encounters,
 * clinical lifecycle transitions, structured SOAP notes, optimistic concurrency,
 * and domain event recording.
 */
export class TreatmentSession implements AggregateRoot<SessionId> {
  private readonly _id: SessionId;
  private _version: number;
  private _status: SessionStatus;
  private readonly _clientId: string;
  private _therapistId: string;
  private readonly _appointmentId: string;
  private _cancellationReason?: string;
  private _notes: SessionNotes;
  private readonly _createdAt: Date;
  private _updatedAt: Date;
  private uncommittedEvents: DomainEvent[] = [];

  private constructor(props: ReconstituteTreatmentSessionProps) {
    if (!props.id) {
      throw new Error('Session ID cannot be empty.');
    }
    if (!props.clientId || props.clientId.trim().length === 0) {
      throw new Error('Client ID cannot be empty.');
    }
    if (!props.therapistId || props.therapistId.trim().length === 0) {
      throw new Error('Therapist ID cannot be empty.');
    }
    if (!props.appointmentId || props.appointmentId.trim().length === 0) {
      throw new Error('Appointment ID cannot be empty.');
    }
    if (!props.status || !Object.values(SessionStatus).includes(props.status)) {
      throw new Error(`Invalid SessionStatus: '${props.status}'.`);
    }
    if (!props.notes) {
      throw new Error('Session notes cannot be null or undefined.');
    }
    if (!props.createdAt || !props.updatedAt) {
      throw new Error('Session timestamps must be provided.');
    }
    if (props.version < 1) {
      throw new Error('Aggregate version must be greater than or equal to 1.');
    }

    this._id = props.id;
    this._version = props.version;
    this._status = props.status;
    this._clientId = props.clientId.trim();
    this._therapistId = props.therapistId.trim();
    this._appointmentId = props.appointmentId.trim();
    this._cancellationReason = props.cancellationReason?.trim() || undefined;
    this._notes = props.notes;
    this._createdAt = new Date(props.createdAt.getTime());
    this._updatedAt = new Date(props.updatedAt.getTime());
  }

  /**
   * Factory method to create a new TreatmentSession aggregate.
   * Enforces initial status as SCHEDULED, version 1, and records TreatmentSessionCreatedEvent.
   */
  public static create(props: CreateTreatmentSessionProps, clock?: Clock): TreatmentSession {
    const sessionId = props.id ?? SessionId.create();
    const now = clock ? clock.now() : new Date();

    const session = new TreatmentSession({
      id: sessionId,
      version: 1,
      status: SessionStatus.SCHEDULED,
      clientId: props.clientId,
      therapistId: props.therapistId,
      appointmentId: props.appointmentId,
      notes: props.notes ?? SessionNotes.empty(),
      createdAt: now,
      updatedAt: now,
    });

    session.recordEvent(
      new TreatmentSessionCreatedEvent(
        sessionId.getValue(),
        props.clientId.trim(),
        props.therapistId.trim(),
        props.appointmentId.trim(),
        1,
        now,
      ),
    );

    return session;
  }

  /**
   * Reconstitutes an existing TreatmentSession aggregate from persistence data
   * without generating uncommitted domain events.
   */
  public static reconstitute(props: ReconstituteTreatmentSessionProps): TreatmentSession {
    return new TreatmentSession(props);
  }

  /**
   * Starts the treatment session, transitioning from SCHEDULED to IN_PROGRESS.
   */
  public start(clock?: Clock): void {
    if (this._status !== SessionStatus.SCHEDULED) {
      throw new InvalidSessionTransitionException(
        this._status,
        SessionStatus.IN_PROGRESS,
        `Session must be in 'SCHEDULED' status to be started.`,
      );
    }
    this._status = SessionStatus.IN_PROGRESS;
    this._version++;
    this.touch(clock);

    this.recordEvent(
      new TreatmentSessionStartedEvent(
        this._id.getValue(),
        this._clientId,
        this._therapistId,
        this._version,
        this._updatedAt,
      ),
    );
  }

  /**
   * Completes the treatment session, transitioning from IN_PROGRESS to COMPLETED.
   */
  public complete(clock?: Clock): void {
    if (this._status !== SessionStatus.IN_PROGRESS) {
      throw new InvalidSessionTransitionException(
        this._status,
        SessionStatus.COMPLETED,
        `Session must be in 'IN_PROGRESS' status to be completed.`,
      );
    }
    this._status = SessionStatus.COMPLETED;
    this._version++;
    this.touch(clock);

    this.recordEvent(
      new TreatmentSessionCompletedEvent(
        this._id.getValue(),
        this._clientId,
        this._therapistId,
        this._appointmentId,
        this._version,
        this._updatedAt,
      ),
    );
  }

  /**
   * Cancels the treatment session, transitioning from SCHEDULED to CANCELLED.
   */
  public cancel(reason?: string, clock?: Clock): void {
    if (this._status !== SessionStatus.SCHEDULED) {
      throw new InvalidSessionTransitionException(
        this._status,
        SessionStatus.CANCELLED,
        `Session must be in 'SCHEDULED' status to be cancelled.`,
      );
    }
    this._status = SessionStatus.CANCELLED;
    this._cancellationReason = reason?.trim() || undefined;
    this._version++;
    this.touch(clock);

    this.recordEvent(
      new TreatmentSessionCancelledEvent(
        this._id.getValue(),
        this._clientId,
        this._cancellationReason,
        this._version,
        this._updatedAt,
      ),
    );
  }

  /**
   * Marks the treatment session as a NO_SHOW, transitioning from SCHEDULED to NO_SHOW.
   */
  public markAsNoShow(clock?: Clock): void {
    if (this._status !== SessionStatus.SCHEDULED) {
      throw new InvalidSessionTransitionException(
        this._status,
        SessionStatus.NO_SHOW,
        `Session must be in 'SCHEDULED' status to be marked as no-show.`,
      );
    }
    this._status = SessionStatus.NO_SHOW;
    this._version++;
    this.touch(clock);

    this.recordEvent(
      new TreatmentSessionNoShowEvent(
        this._id.getValue(),
        this._clientId,
        this._version,
        this._updatedAt,
      ),
    );
  }

  /**
   * Updates clinical session notes.
   */
  public updateNotes(notes: SessionNotes, clock?: Clock): void {
    if (!notes) {
      throw new Error('Session notes cannot be null or undefined.');
    }
    if (this._status === SessionStatus.CANCELLED || this._status === SessionStatus.NO_SHOW) {
      throw new Error(`Cannot update clinical notes for a session in '${this._status}' status.`);
    }
    this._notes = notes;
    this._version++;
    this.touch(clock);

    this.recordEvent(
      new TreatmentSessionNotesUpdatedEvent(
        this._id.getValue(),
        this._clientId,
        this._therapistId,
        this._version,
        this._updatedAt,
      ),
    );
  }

  /**
   * Reassigns the practitioner conducting this treatment session.
   */
  public assignTherapist(newTherapistId: string, clock?: Clock): void {
    if (!newTherapistId || newTherapistId.trim().length === 0) {
      throw new Error('Therapist ID cannot be empty.');
    }
    if (
      this._status === SessionStatus.COMPLETED ||
      this._status === SessionStatus.CANCELLED ||
      this._status === SessionStatus.NO_SHOW
    ) {
      throw new Error(
        `Cannot reassign therapist for a session in '${this._status}' terminal status.`,
      );
    }
    const previousTherapistId = this._therapistId;
    this._therapistId = newTherapistId.trim();
    this._version++;
    this.touch(clock);

    this.recordEvent(
      new TherapistAssignedToSessionEvent(
        this._id.getValue(),
        this._clientId,
        previousTherapistId,
        this._therapistId,
        this._version,
        this._updatedAt,
      ),
    );
  }

  /** Gets the unique aggregate identifier */
  public get id(): SessionId {
    return this._id;
  }

  /** Gets the optimistic concurrency version */
  public get version(): number {
    return this._version;
  }

  /** Gets the clinical lifecycle status */
  public get status(): SessionStatus {
    return this._status;
  }

  /** Gets the associated Client identifier */
  public get clientId(): string {
    return this._clientId;
  }

  /** Gets the associated Therapist identifier */
  public get therapistId(): string {
    return this._therapistId;
  }

  /** Gets the correlated Appointment identifier */
  public get appointmentId(): string {
    return this._appointmentId;
  }

  /** Gets the cancellation reason if cancelled */
  public get cancellationReason(): string | undefined {
    return this._cancellationReason;
  }

  /** Gets the clinical session notes */
  public get notes(): SessionNotes {
    return this._notes;
  }

  /** Gets the creation timestamp (defensive copy) */
  public get createdAt(): Date {
    return new Date(this._createdAt.getTime());
  }

  /** Gets the last update timestamp (defensive copy) */
  public get updatedAt(): Date {
    return new Date(this._updatedAt.getTime());
  }

  /** Returns all uncommitted domain events recorded by this aggregate */
  public getUncommittedEvents(): ReadonlyArray<DomainEvent> {
    return [...this.uncommittedEvents];
  }

  /** Clears all uncommitted domain events */
  public clearEvents(): void {
    this.uncommittedEvents = [];
  }

  /** Records a domain event internally */
  protected recordEvent(event: DomainEvent): void {
    this.uncommittedEvents.push(event);
  }

  private touch(clock?: Clock): void {
    this._updatedAt = clock ? clock.now() : new Date();
  }
}
