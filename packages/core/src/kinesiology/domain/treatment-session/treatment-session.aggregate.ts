import { AggregateRoot } from '../shared/aggregate-root';
import { DomainEvent } from '../shared/domain-event';
import { Clock } from '../shared/clock';
import { SessionId } from './session-id.vo';
import { SessionStatus } from './session-status.enum';
import { SessionNotes } from './session-notes.vo';

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
  notes: SessionNotes;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * TreatmentSession Aggregate Root governing clinical therapy encounters,
 * clinical lifecycle transitions, structured SOAP notes, and optimistic concurrency.
 */
export class TreatmentSession implements AggregateRoot<SessionId> {
  private readonly _id: SessionId;
  private _version: number;
  private _status: SessionStatus;
  private readonly _clientId: string;
  private _therapistId: string;
  private _appointmentId: string;
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
    this._notes = props.notes;
    this._createdAt = props.createdAt;
    this._updatedAt = props.updatedAt;
  }

  /**
   * Factory method to create a new TreatmentSession aggregate.
   * Enforces initial status as SCHEDULED and initial version as 1.
   */
  public static create(props: CreateTreatmentSessionProps, clock?: Clock): TreatmentSession {
    const sessionId = props.id ?? SessionId.create();
    const now = clock ? clock.now() : new Date();

    return new TreatmentSession({
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
  }

  /**
   * Reconstitutes an existing TreatmentSession aggregate from persistence data.
   */
  public static reconstitute(props: ReconstituteTreatmentSessionProps): TreatmentSession {
    return new TreatmentSession(props);
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

  /** Gets the clinical session notes */
  public get notes(): SessionNotes {
    return this._notes;
  }

  /** Gets the creation timestamp */
  public get createdAt(): Date {
    return this._createdAt;
  }

  /** Gets the last update timestamp */
  public get updatedAt(): Date {
    return this._updatedAt;
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
}
