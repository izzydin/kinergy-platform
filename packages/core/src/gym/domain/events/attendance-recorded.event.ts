import { DomainEvent } from '../shared/domain-event';
import { CheckInMethod } from '../attendance/check-in-method.enum';
import { AccessResult } from '../attendance/access-result.enum';

export interface AttendanceRecordedEventPayload {
  readonly attendanceId: string;
  readonly clientId: string;
  readonly membershipId: string | null;
  readonly checkInTime: Date;
  readonly gymDay: {
    readonly localDate: string;
    readonly timezone: string;
    readonly facilityId: string;
  };
  readonly method: CheckInMethod;
  readonly result: AccessResult;
  readonly gateId: string | null;
  readonly receptionistId: string | null;
  readonly notes: string | null;
}

/**
 * Domain Event emitted when an attendance check-in is recorded.
 */
export class AttendanceRecordedEvent implements DomainEvent<AttendanceRecordedEventPayload> {
  public readonly eventId: string;
  public readonly eventType = 'AttendanceRecorded';
  public readonly aggregateId: string;
  public readonly aggregateVersion: number;
  public readonly occurredAt: Date;
  public readonly payload: AttendanceRecordedEventPayload;

  constructor(
    attendanceId: string,
    clientId: string,
    membershipId: string | null,
    checkInTime: Date,
    gymDay: { localDate: string; timezone: string; facilityId: string },
    method: CheckInMethod,
    result: AccessResult,
    gateId: string | null = null,
    receptionistId: string | null = null,
    notes: string | null = null,
    aggregateVersion: number = 1,
    occurredAt: Date = new Date(),
  ) {
    this.eventId = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.aggregateId = attendanceId;
    this.aggregateVersion = aggregateVersion;
    this.occurredAt = new Date(occurredAt.getTime());
    this.payload = Object.freeze({
      attendanceId,
      clientId,
      membershipId,
      checkInTime: new Date(checkInTime.getTime()),
      gymDay,
      method,
      result,
      gateId,
      receptionistId,
      notes,
    });
    Object.freeze(this);
  }
}
