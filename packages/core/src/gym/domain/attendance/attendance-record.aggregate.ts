import { AggregateRoot } from '../shared/aggregate-root';
import { DomainEvent } from '../shared/domain-event';
import { Clock } from '../shared/clock';
import { AttendanceId } from './attendance-id.vo';
import { GymDay } from './gym-day.vo';
import { CheckInMethod } from './check-in-method.enum';
import { AccessResult } from './access-result.enum';
import { InvalidAttendanceException } from '../exceptions/invalid-attendance.exception';
import { AttendanceRecordedEvent } from '../events/attendance-recorded.event';

/**
 * Properties required to record a new Attendance event.
 */
export interface RecordAttendanceProps {
  id?: AttendanceId;
  clientId: string;
  membershipId?: string | null;
  checkInTime?: Date;
  gymDay?: GymDay;
  timezone?: string;
  facilityId?: string;
  method: CheckInMethod;
  result: AccessResult;
  gateId?: string | null;
  receptionistId?: string | null;
  notes?: string | null;
}

/**
 * Properties required to reconstitute an existing Attendance record from persistence.
 */
export interface ReconstituteAttendanceProps {
  id: AttendanceId;
  clientId: string;
  membershipId: string | null;
  checkInTime: Date;
  gymDay: GymDay;
  method: CheckInMethod;
  result: AccessResult;
  gateId: string | null;
  receptionistId: string | null;
  notes: string | null;
  createdAt: Date;
}

/**
 * Append-only Domain Aggregate Root representing an immutable physical check-in event.
 *
 * Invariants:
 * 1. Physical check-ins are write-once, immutable historical facts.
 * 2. Every granted check-in must reference the authorizing membershipId.
 * 3. Client identity must be a valid, non-empty scalar string.
 * 4. Timestamps are authoritative UTC points in time; business dates are facility-local GymDay values.
 */
export class AttendanceRecord implements AggregateRoot<AttendanceId> {
  private readonly _id: AttendanceId;
  private readonly _clientId: string;
  private readonly _membershipId: string | null;
  private readonly _checkInTime: Date;
  private readonly _gymDay: GymDay;
  private readonly _method: CheckInMethod;
  private readonly _result: AccessResult;
  private readonly _gateId: string | null;
  private readonly _receptionistId: string | null;
  private readonly _notes: string | null;
  private readonly _createdAt: Date;

  private _domainEvents: DomainEvent[] = [];

  private constructor(
    id: AttendanceId,
    clientId: string,
    membershipId: string | null,
    checkInTime: Date,
    gymDay: GymDay,
    method: CheckInMethod,
    result: AccessResult,
    gateId: string | null,
    receptionistId: string | null,
    notes: string | null,
    createdAt: Date,
  ) {
    if (!clientId || clientId.trim().length === 0) {
      throw new InvalidAttendanceException('Client ID cannot be empty.');
    }

    if (!checkInTime || !(checkInTime instanceof Date) || isNaN(checkInTime.getTime())) {
      throw new InvalidAttendanceException('Check-in timestamp must be a valid Date.');
    }

    if (!gymDay || !(gymDay instanceof GymDay)) {
      throw new InvalidAttendanceException('GymDay must be a valid GymDay Value Object.');
    }

    if (!Object.values(CheckInMethod).includes(method)) {
      throw new InvalidAttendanceException(`Invalid check-in method: '${method}'.`);
    }

    if (!Object.values(AccessResult).includes(result)) {
      throw new InvalidAttendanceException(`Invalid access result: '${result}'.`);
    }

    // Business Invariant: Granted access MUST identify the authorizing membership agreement
    if (result === AccessResult.GRANTED && (!membershipId || membershipId.trim().length === 0)) {
      throw new InvalidAttendanceException(
        'Granted check-in records must reference the authorizing membershipId.',
      );
    }

    this._id = id;
    this._clientId = clientId.trim();
    this._membershipId = membershipId?.trim() || null;
    this._checkInTime = new Date(checkInTime.getTime());
    this._gymDay = gymDay;
    this._method = method;
    this._result = result;
    this._gateId = gateId?.trim() || null;
    this._receptionistId = receptionistId?.trim() || null;
    this._notes = notes?.trim() || null;
    this._createdAt = new Date(createdAt.getTime());

    Object.freeze(this);
  }

  /**
   * Factory method to record and emit a new physical attendance check-in.
   */
  public static record(props: RecordAttendanceProps, clock?: Clock): AttendanceRecord {
    const checkInTime = props.checkInTime ?? (clock ? clock.now() : new Date());
    if (!checkInTime || !(checkInTime instanceof Date) || isNaN(checkInTime.getTime())) {
      throw new InvalidAttendanceException('Check-in timestamp must be a valid Date.');
    }

    const id = props.id ?? AttendanceId.create();
    const gymDay = props.gymDay ?? GymDay.fromUtc(checkInTime, props.timezone, props.facilityId);

    const record = new AttendanceRecord(
      id,
      props.clientId,
      props.membershipId ?? null,
      checkInTime,
      gymDay,
      props.method,
      props.result,
      props.gateId ?? null,
      props.receptionistId ?? null,
      props.notes ?? null,
      checkInTime,
    );

    record.addDomainEvent(
      new AttendanceRecordedEvent(
        id.value,
        record.clientId,
        record.membershipId,
        record.checkInTime,
        record.gymDay.getValue(),
        record.method,
        record.result,
        record.gateId,
        record.receptionistId,
        record.notes,
        1,
        checkInTime,
      ),
    );

    return record;
  }

  /**
   * Reconstitutes an existing AttendanceRecord from persistence without emitting domain events.
   */
  public static reconstitute(props: ReconstituteAttendanceProps): AttendanceRecord {
    return new AttendanceRecord(
      props.id,
      props.clientId,
      props.membershipId,
      props.checkInTime,
      props.gymDay,
      props.method,
      props.result,
      props.gateId,
      props.receptionistId,
      props.notes,
      props.createdAt,
    );
  }

  public get id(): AttendanceId {
    return this._id;
  }

  public get version(): number {
    return 1; // Immutable append-only log; version is always 1
  }

  public get clientId(): string {
    return this._clientId;
  }

  public get membershipId(): string | null {
    return this._membershipId;
  }

  public get checkInTime(): Date {
    return new Date(this._checkInTime.getTime());
  }

  public get gymDay(): GymDay {
    return this._gymDay;
  }

  public get method(): CheckInMethod {
    return this._method;
  }

  public get result(): AccessResult {
    return this._result;
  }

  public get gateId(): string | null {
    return this._gateId;
  }

  public get receptionistId(): string | null {
    return this._receptionistId;
  }

  public get notes(): string | null {
    return this._notes;
  }

  public get createdAt(): Date {
    return new Date(this._createdAt.getTime());
  }

  public isGranted(): boolean {
    return this._result === AccessResult.GRANTED;
  }

  public isDenied(): boolean {
    return this._result !== AccessResult.GRANTED;
  }

  protected addDomainEvent(event: DomainEvent): void {
    this._domainEvents.push(event);
  }

  public getUncommittedEvents(): ReadonlyArray<DomainEvent> {
    return [...this._domainEvents];
  }

  public clearEvents(): void {
    this._domainEvents.length = 0;
  }
}
