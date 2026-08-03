import { AggregateRoot } from '../shared/aggregate-root';
import { DomainEvent } from '../shared/domain-event';
import { Clock } from '../shared/clock';
import { AppointmentId } from './appointment-id.vo';
import { AppointmentStatus } from '../value-objects/appointment-status.enum';
import { AppointmentType } from '../value-objects/appointment-type.vo';
import { TimeRange } from '../value-objects/time-range.vo';
import { InvalidAppointmentTransitionException } from '../exceptions/invalid-appointment-transition.exception';
import {
  AppointmentCreatedEvent,
  AppointmentCancelledEvent,
  AppointmentRescheduledEvent,
  RoomAssignedEvent,
  TherapistAssignedEvent,
} from '../events';

export interface CreateAppointmentProps {
  id?: AppointmentId;
  clientId: string;
  therapistId: string;
  roomId: string;
  type: AppointmentType;
  timeRange: TimeRange;
}

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
  createdAt: Date;
  updatedAt: Date;
}

export class Appointment implements AggregateRoot<AppointmentId> {
  private readonly _id: AppointmentId;
  private _version: number;
  private _status: AppointmentStatus;
  private _type: AppointmentType;
  private _clientId: string;
  private _therapistId: string;
  private _roomId: string;
  private _timeRange: TimeRange;
  private _cancellationReason?: string;
  private readonly _createdAt: Date;
  private _updatedAt: Date;
  private uncommittedEvents: DomainEvent[] = [];

  private constructor(props: ReconstituteAppointmentProps) {
    this._id = props.id;
    this._version = props.version;
    this._status = props.status;
    this._type = props.type;
    this._clientId = props.clientId;
    this._therapistId = props.therapistId;
    this._roomId = props.roomId;
    this._timeRange = props.timeRange;
    this._cancellationReason = props.cancellationReason;
    this._createdAt = new Date(props.createdAt.getTime());
    this._updatedAt = new Date(props.updatedAt.getTime());
  }

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
        now,
      ),
    );

    return appointment;
  }

  public static reconstitute(props: ReconstituteAppointmentProps): Appointment {
    return new Appointment(props);
  }

  // Getters
  public get id(): AppointmentId {
    return this._id;
  }

  public get version(): number {
    return this._version;
  }

  public get status(): AppointmentStatus {
    return this._status;
  }

  public get type(): AppointmentType {
    return this._type;
  }

  public get clientId(): string {
    return this._clientId;
  }

  public get therapistId(): string {
    return this._therapistId;
  }

  public get roomId(): string {
    return this._roomId;
  }

  public get timeRange(): TimeRange {
    return this._timeRange;
  }

  public get cancellationReason(): string | undefined {
    return this._cancellationReason;
  }

  public get createdAt(): Date {
    return new Date(this._createdAt.getTime());
  }

  public get updatedAt(): Date {
    return new Date(this._updatedAt.getTime());
  }

  // Behaviors & Transitions
  public confirm(clock?: Clock): void {
    if (this._status !== AppointmentStatus.SCHEDULED) {
      throw new InvalidAppointmentTransitionException(this._status, AppointmentStatus.CONFIRMED);
    }
    this._status = AppointmentStatus.CONFIRMED;
    this.touch(clock);
  }

  public checkIn(clock?: Clock): void {
    if (this._status !== AppointmentStatus.CONFIRMED) {
      throw new InvalidAppointmentTransitionException(this._status, AppointmentStatus.CHECKED_IN);
    }
    this._status = AppointmentStatus.CHECKED_IN;
    this.touch(clock);
  }

  public start(clock?: Clock): void {
    if (this._status !== AppointmentStatus.CHECKED_IN) {
      throw new InvalidAppointmentTransitionException(this._status, AppointmentStatus.IN_PROGRESS);
    }
    this._status = AppointmentStatus.IN_PROGRESS;
    this.touch(clock);
  }

  public complete(clock?: Clock): void {
    if (this._status !== AppointmentStatus.IN_PROGRESS) {
      throw new InvalidAppointmentTransitionException(this._status, AppointmentStatus.COMPLETED);
    }
    this._status = AppointmentStatus.COMPLETED;
    this.touch(clock);
  }

  public cancel(reason: string, clock?: Clock): void {
    if (!reason || reason.trim().length === 0) {
      throw new Error('Cancellation reason is required.');
    }
    if (
      this._status === AppointmentStatus.COMPLETED ||
      this._status === AppointmentStatus.CANCELLED
    ) {
      throw new InvalidAppointmentTransitionException(
        this._status,
        AppointmentStatus.CANCELLED,
        `Cannot cancel appointment in '${this._status}' status.`,
      );
    }

    this._status = AppointmentStatus.CANCELLED;
    this._cancellationReason = reason.trim();
    const now = clock ? clock.now() : new Date();
    this.touch(clock);

    this.recordEvent(
      new AppointmentCancelledEvent(this._id.getValue(), this._cancellationReason, now),
    );
  }

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
      new AppointmentRescheduledEvent(this._id.getValue(), oldRange, newTimeRange, now),
    );
  }

  public assignRoom(newRoomId: string, clock?: Clock): void {
    if (!newRoomId || newRoomId.trim().length === 0) {
      throw new Error('Room ID cannot be empty.');
    }
    this.assertNonTerminalState('assign room');

    const oldRoomId = this._roomId;
    this._roomId = newRoomId.trim();
    const now = clock ? clock.now() : new Date();
    this.touch(clock);

    this.recordEvent(new RoomAssignedEvent(this._id.getValue(), oldRoomId, this._roomId, now));
  }

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
      new TherapistAssignedEvent(this._id.getValue(), oldTherapistId, this._therapistId, now),
    );
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

  // Private Helper Methods
  private touch(clock?: Clock): void {
    this._version += 1;
    this._updatedAt = clock ? clock.now() : new Date();
  }

  private recordEvent(event: DomainEvent): void {
    this.uncommittedEvents.push(event);
  }

  private assertNonTerminalState(actionName: string): void {
    if (
      this._status === AppointmentStatus.COMPLETED ||
      this._status === AppointmentStatus.CANCELLED
    ) {
      throw new InvalidAppointmentTransitionException(
        this._status,
        undefined,
        `Cannot ${actionName} for appointment in terminal '${this._status}' status.`,
      );
    }
  }
}
