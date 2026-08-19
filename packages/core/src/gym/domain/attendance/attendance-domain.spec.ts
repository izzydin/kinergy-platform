import { AttendanceRecord } from './attendance-record.aggregate';
import { AttendanceId } from './attendance-id.vo';
import { GymDay } from './gym-day.vo';
import { CheckInMethod } from './check-in-method.enum';
import { AccessResult } from './access-result.enum';
import { InvalidAttendanceException } from '../exceptions/invalid-attendance.exception';
import { AttendanceRecordedEvent } from '../events/attendance-recorded.event';
import { Clock } from '../shared/clock';

class TestFixedClock implements Clock {
  constructor(
    private readonly _now: Date,
    private readonly _tz: string = 'America/Guayaquil',
  ) {}
  public now(): Date {
    return new Date(this._now.getTime());
  }
  public timezone(): string {
    return this._tz;
  }
}

describe('Phase 5.5-C: Attendance Domain Behavior & Aggregate Specification', () => {
  const fixedUtc = new Date('2026-08-19T14:30:00.000Z');
  const clock = new TestFixedClock(fixedUtc, 'America/Guayaquil');

  describe('1. AttendanceRecord Creation & Factory Invariants', () => {
    it('1.1 Records a valid GRANTED check-in with authorizing membership and derived GymDay', () => {
      const record = AttendanceRecord.record(
        {
          clientId: 'client_100',
          membershipId: 'mem_200',
          method: CheckInMethod.RFID,
          result: AccessResult.GRANTED,
          gateId: 'gate_turnstile_1',
          timezone: 'America/Guayaquil',
          facilityId: 'gym_north',
        },
        clock,
      );

      expect(record.id.value).toMatch(/^att_\d+_[a-z0-9]+$/);
      expect(record.clientId).toBe('client_100');
      expect(record.membershipId).toBe('mem_200');
      expect(record.checkInTime.toISOString()).toBe(fixedUtc.toISOString());
      expect(record.method).toBe(CheckInMethod.RFID);
      expect(record.result).toBe(AccessResult.GRANTED);
      expect(record.isGranted()).toBe(true);
      expect(record.isDenied()).toBe(false);
      expect(record.gateId).toBe('gate_turnstile_1');
      expect(record.gymDay.localDate).toBe('2026-08-19');
      expect(record.gymDay.timezone).toBe('America/Guayaquil');
      expect(record.gymDay.facilityId).toBe('gym_north');
      expect(record.version).toBe(1);
    });

    it('1.2 Records a valid DENIED check-in without requiring a membershipId', () => {
      const record = AttendanceRecord.record(
        {
          clientId: 'client_101',
          membershipId: null,
          method: CheckInMethod.QR_CODE,
          result: AccessResult.DENIED_NO_MEMBERSHIP,
          notes: 'No active plan on file',
        },
        clock,
      );

      expect(record.clientId).toBe('client_101');
      expect(record.membershipId).toBeNull();
      expect(record.isGranted()).toBe(false);
      expect(record.isDenied()).toBe(true);
      expect(record.result).toBe(AccessResult.DENIED_NO_MEMBERSHIP);
      expect(record.notes).toBe('No active plan on file');
    });

    it('1.3 Throws InvalidAttendanceException if GRANTED check-in has null or empty membershipId', () => {
      expect(() =>
        AttendanceRecord.record({
          clientId: 'client_100',
          membershipId: null,
          method: CheckInMethod.BARCODE,
          result: AccessResult.GRANTED,
        }),
      ).toThrow(InvalidAttendanceException);

      expect(() =>
        AttendanceRecord.record({
          clientId: 'client_100',
          membershipId: '   ',
          method: CheckInMethod.BARCODE,
          result: AccessResult.GRANTED,
        }),
      ).toThrow('Granted check-in records must reference the authorizing membershipId.');
    });

    it('1.4 Throws InvalidAttendanceException if clientId is missing or blank', () => {
      expect(() =>
        AttendanceRecord.record({
          clientId: '',
          membershipId: 'mem_1',
          method: CheckInMethod.BIOMETRIC,
          result: AccessResult.GRANTED,
        }),
      ).toThrow('Client ID cannot be empty.');
    });

    it('1.5 Throws InvalidAttendanceException if checkInTime is an invalid Date', () => {
      expect(() =>
        AttendanceRecord.record({
          clientId: 'client_100',
          membershipId: 'mem_1',
          checkInTime: new Date('invalid-date'),
          method: CheckInMethod.BIOMETRIC,
          result: AccessResult.GRANTED,
        }),
      ).toThrow('Check-in timestamp must be a valid Date.');
    });
  });

  describe('2. GymDay Value Object & Facility-Local Derivation', () => {
    it('2.1 Derives local date across timezones correctly', () => {
      // 2026-08-20 02:30 UTC is 2026-08-19 21:30 in America/Guayaquil (UTC-5)
      const lateUtc = new Date('2026-08-20T02:30:00.000Z');
      const gymDayGuayaquil = GymDay.fromUtc(lateUtc, 'America/Guayaquil', 'gym_branch_1');
      expect(gymDayGuayaquil.localDate).toBe('2026-08-19');
      expect(gymDayGuayaquil.facilityId).toBe('gym_branch_1');

      // In Tokyo (UTC+9), 2026-08-20 02:30 UTC is 2026-08-20 11:30
      const gymDayTokyo = GymDay.fromUtc(lateUtc, 'Asia/Tokyo', 'gym_tokyo');
      expect(gymDayTokyo.localDate).toBe('2026-08-20');
    });

    it('2.2 Validates explicit calendar day and rejects impossible dates', () => {
      expect(() => GymDay.create('2026-02-29')).toThrow('not a valid calendar date'); // 2026 is not a leap year
      expect(() => GymDay.create('2026-13-01')).toThrow('not a valid calendar date');
      expect(() => GymDay.create('invalid-format')).toThrow('must be formatted as YYYY-MM-DD');

      const validLeapDay = GymDay.create('2024-02-29', 'UTC', 'main');
      expect(validLeapDay.localDate).toBe('2024-02-29');
    });

    it('2.3 Enforces value equality', () => {
      const d1 = GymDay.create('2026-08-19', 'UTC', 'f1');
      const d2 = GymDay.create('2026-08-19', 'UTC', 'f1');
      const d3 = GymDay.create('2026-08-19', 'America/Guayaquil', 'f1');

      expect(d1.equals(d2)).toBe(true);
      expect(d1.equals(d3)).toBe(false);
    });
  });

  describe('3. AttendanceId Value Object', () => {
    it('3.1 Creates generated unique IDs with att_ prefix', () => {
      const id1 = AttendanceId.create();
      const id2 = AttendanceId.create();
      expect(id1.value).toMatch(/^att_\d+_[a-z0-9]+$/);
      expect(id1.equals(id2)).toBe(false);
    });

    it('3.2 Wraps explicit string IDs and rejects empty input', () => {
      const id = AttendanceId.create('att_custom_123');
      expect(id.value).toBe('att_custom_123');
      expect(id.toString()).toBe('att_custom_123');

      expect(() => AttendanceId.create('')).toThrow('Attendance ID cannot be empty.');
      expect(() => AttendanceId.create('   ')).toThrow('Attendance ID cannot be empty.');
    });
  });

  describe('4. Domain Events & Reconstitution', () => {
    it('4.1 Emits AttendanceRecordedEvent upon creation', () => {
      const record = AttendanceRecord.record(
        {
          clientId: 'client_555',
          membershipId: 'mem_888',
          method: CheckInMethod.MANUAL_RECEPTION,
          result: AccessResult.GRANTED,
          receptionistId: 'staff_jane',
          notes: 'Forgot RFID card, checked in manually',
        },
        clock,
      );

      const events = record.getUncommittedEvents();
      expect(events).toHaveLength(1);
      const event = events[0] as AttendanceRecordedEvent;
      expect(event.eventType).toBe('AttendanceRecorded');
      expect(event.aggregateId).toBe(record.id.value);
      expect(event.payload.clientId).toBe('client_555');
      expect(event.payload.membershipId).toBe('mem_888');
      expect(event.payload.method).toBe(CheckInMethod.MANUAL_RECEPTION);
      expect(event.payload.result).toBe(AccessResult.GRANTED);
      expect(event.payload.receptionistId).toBe('staff_jane');

      record.clearEvents();
      expect(record.getUncommittedEvents()).toHaveLength(0);
    });

    it('4.2 Reconstitutes existing entity from persistence without emitting domain events', () => {
      const record = AttendanceRecord.reconstitute({
        id: AttendanceId.create('att_existing_1'),
        clientId: 'client_555',
        membershipId: 'mem_888',
        checkInTime: fixedUtc,
        gymDay: GymDay.create('2026-08-19', 'America/Guayaquil', 'main'),
        method: CheckInMethod.RFID,
        result: AccessResult.GRANTED,
        gateId: 'gate_1',
        receptionistId: null,
        notes: null,
        createdAt: fixedUtc,
      });

      expect(record.id.value).toBe('att_existing_1');
      expect(record.getUncommittedEvents()).toHaveLength(0);
    });
  });

  describe('5. Immutability & Historical Fact Integrity', () => {
    it('5.1 Protects internal Date references against external mutation', () => {
      const record = AttendanceRecord.record(
        {
          clientId: 'client_100',
          membershipId: 'mem_200',
          method: CheckInMethod.RFID,
          result: AccessResult.GRANTED,
        },
        clock,
      );

      const time1 = record.checkInTime;
      time1.setFullYear(2099); // External mutation attempt

      expect(record.checkInTime.getFullYear()).toBe(2026); // Preserved
    });

    it('5.2 Freezes the aggregate instance', () => {
      const record = AttendanceRecord.record(
        {
          clientId: 'client_100',
          membershipId: 'mem_200',
          method: CheckInMethod.RFID,
          result: AccessResult.GRANTED,
        },
        clock,
      );

      expect(Object.isFrozen(record)).toBe(true);
    });
  });
});
