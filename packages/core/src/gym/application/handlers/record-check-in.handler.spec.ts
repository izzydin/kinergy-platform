import { RecordCheckInHandler } from './record-check-in.handler';
import { RecordCheckInCommand } from '../commands/record-check-in.command';
import { AttendanceRecordRepository } from '../../domain/repositories/attendance-record.repository';
import { MembershipEligibilityPort } from '../ports/membership-eligibility.port';
import { GymEventPublisherPort } from '../ports/gym-event-publisher.port';
import { Clock } from '../../domain/shared/clock';
import { AttendanceRecord } from '../../domain/attendance/attendance-record.aggregate';
import { AccessResult } from '../../domain/attendance/access-result.enum';
import { CheckInMethod } from '../../domain/attendance/check-in-method.enum';
import { MembershipEligibilityOutcome } from '../dtos/membership-eligibility-outcome.enum';
import { MembershipEligibilityResultDTO } from '../dtos/membership-eligibility-result.dto';
import { DomainEvent } from '../../domain/shared/domain-event';
import { AttendanceId } from '../../domain/attendance/attendance-id.vo';

class MockClock implements Clock {
  constructor(
    private _now: Date,
    private _tz: string = 'America/Guayaquil',
  ) {}
  public now(): Date {
    return new Date(this._now.getTime());
  }
  public timezone(): string {
    return this._tz;
  }
  public setNow(date: Date): void {
    this._now = date;
  }
}

class InMemoryAttendanceRepository implements AttendanceRecordRepository {
  public records: AttendanceRecord[] = [];

  public async append(record: AttendanceRecord): Promise<void> {
    this.records.push(record);
  }

  public async findById(id: AttendanceId | string): Promise<AttendanceRecord | null> {
    const idVal = typeof id === 'string' ? id : id.value;
    return this.records.find((r) => r.id.value === idVal) || null;
  }

  public async findByClientId(clientId: string, limit?: number): Promise<AttendanceRecord[]> {
    const matching = this.records
      .filter((r) => r.clientId === clientId)
      .sort((a, b) => b.checkInTime.getTime() - a.checkInTime.getTime());
    return limit ? matching.slice(0, limit) : matching;
  }

  public async findRecentByClientId(clientId: string, since: Date): Promise<AttendanceRecord[]> {
    return this.records
      .filter((r) => r.clientId === clientId && r.checkInTime.getTime() >= since.getTime())
      .sort((a, b) => b.checkInTime.getTime() - a.checkInTime.getTime());
  }

  public async findByGymDay(gymDay: string, facilityId?: string): Promise<AttendanceRecord[]> {
    return this.records.filter(
      (r) => r.gymDay.localDate === gymDay && (!facilityId || r.gymDay.facilityId === facilityId),
    );
  }

  public async countGrantedByGymDay(gymDay: string, facilityId?: string): Promise<number> {
    return this.records.filter(
      (r) =>
        r.isGranted() &&
        r.gymDay.localDate === gymDay &&
        (!facilityId || r.gymDay.facilityId === facilityId),
    ).length;
  }

  public async countGrantedByClientAndGymDay(clientId: string, gymDay: string): Promise<number> {
    return this.records.filter(
      (r) => r.clientId === clientId && r.isGranted() && r.gymDay.localDate === gymDay,
    ).length;
  }
}

class MockEligibilityPort implements MembershipEligibilityPort {
  public eligibilityResponse: MembershipEligibilityResultDTO = {
    isEligible: true,
    outcome: MembershipEligibilityOutcome.ELIGIBLE,
    membershipId: 'mem_valid_123',
    planId: 'plan_unlimited_gold',
    period: {
      startDate: '2026-08-01T00:00:00.000Z',
      endDate: '2026-09-01T00:00:00.000Z',
    },
    evaluatedAt: '2026-08-19T10:00:00.000Z',
    reason: 'Active membership covering evaluation time.',
  };

  public async evaluateEligibility(
    _clientId: string,
    _asOf?: Date,
  ): Promise<MembershipEligibilityResultDTO> {
    return this.eligibilityResponse;
  }
}

class MockEventPublisher implements GymEventPublisherPort {
  public publishedEvents: DomainEvent[] = [];

  public async publish(events: ReadonlyArray<DomainEvent>): Promise<void> {
    this.publishedEvents.push(...events);
  }
}

describe('Phase 5.5-D: RecordCheckInHandler Use Case Specification', () => {
  let repository: InMemoryAttendanceRepository;
  let eligibilityPort: MockEligibilityPort;
  let eventPublisher: MockEventPublisher;
  let clock: MockClock;
  let handler: RecordCheckInHandler;

  const baseDate = new Date('2026-08-19T15:00:00.000Z');

  beforeEach(() => {
    repository = new InMemoryAttendanceRepository();
    eligibilityPort = new MockEligibilityPort();
    eventPublisher = new MockEventPublisher();
    clock = new MockClock(baseDate, 'America/Guayaquil');
    handler = new RecordCheckInHandler(repository, eligibilityPort, clock, eventPublisher);
  });

  describe('1. Successful Physical Check-Ins', () => {
    it('1.1 Records a granted RFID check-in and dispatches domain event', async () => {
      const command = new RecordCheckInCommand({
        clientId: 'client_active_1',
        method: CheckInMethod.RFID,
        gateId: 'gate_turnstile_main',
      });

      const result = await handler.execute(command);
      expect(result.isSuccess).toBe(true);

      const dto = result.getValue();
      expect(dto.isGranted).toBe(true);
      expect(dto.outcome).toBe(AccessResult.GRANTED);
      expect(dto.attendanceId).toMatch(/^att_\d+_[a-z0-9]+$/);
      expect(dto.clientId).toBe('client_active_1');
      expect(dto.membershipId).toBe('mem_valid_123');
      expect(dto.planId).toBe('plan_unlimited_gold');
      expect(dto.gateId).toBe('gate_turnstile_main');
      expect(dto.gymDay.localDate).toBe('2026-08-19');
      expect(dto.isDuplicate).toBe(false);
      expect(dto.isIdempotentReplay).toBe(false);

      // Verify persistence
      expect(repository.records).toHaveLength(1);
      expect(repository.records[0]!.isGranted()).toBe(true);

      // Verify domain event
      expect(eventPublisher.publishedEvents).toHaveLength(1);
      expect(eventPublisher.publishedEvents[0]!.eventType).toBe('AttendanceRecorded');
    });

    it('1.2 Records a manual reception admission with receptionist ID and notes', async () => {
      const command = new RecordCheckInCommand({
        clientId: 'client_active_1',
        method: CheckInMethod.MANUAL_RECEPTION,
        receptionistId: 'staff_reception_bob',
        notes: 'VIP guest admission verified manually',
      });

      const result = await handler.execute(command);
      expect(result.isSuccess).toBe(true);

      const dto = result.getValue();
      expect(dto.isGranted).toBe(true);
      expect(dto.method).toBe(CheckInMethod.MANUAL_RECEPTION);
      expect(dto.receptionistId).toBe('staff_reception_bob');
      expect(repository.records[0]!.notes).toBe('VIP guest admission verified manually');
    });
  });

  describe('2. Ineligible Client & Membership Ingress Denials', () => {
    it('2.1 Rejects when client is inactive or not found in Client Management', async () => {
      eligibilityPort.eligibilityResponse = {
        isEligible: false,
        outcome: MembershipEligibilityOutcome.INACTIVE_CLIENT,
        membershipId: null,
        planId: null,
        period: null,
        evaluatedAt: baseDate.toISOString(),
        reason: 'Client does not exist or is inactive in Client Management.',
      };

      const command = new RecordCheckInCommand({
        clientId: 'client_unknown',
        method: CheckInMethod.QR_CODE,
      });

      const result = await handler.execute(command);
      expect(result.isSuccess).toBe(true);

      const dto = result.getValue();
      expect(dto.isGranted).toBe(false);
      expect(dto.outcome).toBe(AccessResult.DENIED_INACTIVE_CLIENT);
      expect(dto.denialReason).toContain('Client does not exist or is inactive');

      // Audit trail must persist denied attempt
      expect(repository.records).toHaveLength(1);
      expect(repository.records[0]!.result).toBe(AccessResult.DENIED_INACTIVE_CLIENT);
    });

    it('2.2 Rejects when client has no membership on record', async () => {
      eligibilityPort.eligibilityResponse = {
        isEligible: false,
        outcome: MembershipEligibilityOutcome.NO_MEMBERSHIP,
        membershipId: null,
        planId: null,
        period: null,
        evaluatedAt: baseDate.toISOString(),
        reason: 'Client has no membership agreements on record.',
      };

      const command = new RecordCheckInCommand({
        clientId: 'client_no_mem',
        method: CheckInMethod.BARCODE,
      });

      const result = await handler.execute(command);
      expect(result.isSuccess).toBe(true);
      expect(result.getValue().outcome).toBe(AccessResult.DENIED_NO_MEMBERSHIP);
      expect(repository.records[0]!.result).toBe(AccessResult.DENIED_NO_MEMBERSHIP);
    });

    it('2.3 Rejects when client membership is expired', async () => {
      eligibilityPort.eligibilityResponse = {
        isEligible: false,
        outcome: MembershipEligibilityOutcome.EXPIRED,
        membershipId: 'mem_expired_1',
        planId: 'plan_monthly',
        period: {
          startDate: '2026-07-01T00:00:00.000Z',
          endDate: '2026-08-01T00:00:00.000Z',
        },
        evaluatedAt: baseDate.toISOString(),
        reason: 'Membership expired on 2026-08-01T00:00:00.000Z.',
      };

      const command = new RecordCheckInCommand({
        clientId: 'client_expired',
        method: CheckInMethod.RFID,
      });

      const result = await handler.execute(command);
      expect(result.isSuccess).toBe(true);
      expect(result.getValue().outcome).toBe(AccessResult.DENIED_EXPIRED);
      expect(repository.records[0]!.result).toBe(AccessResult.DENIED_EXPIRED);
    });

    it('2.4 Rejects when client membership is currently frozen', async () => {
      eligibilityPort.eligibilityResponse = {
        isEligible: false,
        outcome: MembershipEligibilityOutcome.FROZEN,
        membershipId: 'mem_frozen_1',
        planId: 'plan_annual',
        period: {
          startDate: '2026-01-01T00:00:00.000Z',
          endDate: '2026-12-31T00:00:00.000Z',
        },
        evaluatedAt: baseDate.toISOString(),
        reason: 'Membership is currently suspended under a freeze window.',
      };

      const command = new RecordCheckInCommand({
        clientId: 'client_frozen',
        method: CheckInMethod.RFID,
      });

      const result = await handler.execute(command);
      expect(result.isSuccess).toBe(true);
      expect(result.getValue().outcome).toBe(AccessResult.DENIED_FROZEN);
      expect(repository.records[0]!.result).toBe(AccessResult.DENIED_FROZEN);
    });
  });

  describe('3. Anti-Passback & Rapid Re-Scan Duplicate Check', () => {
    it('3.1 Denies second check-in attempt within the 5-minute anti-passback window', async () => {
      const command = new RecordCheckInCommand({
        clientId: 'client_passback_1',
        method: CheckInMethod.RFID,
        gateId: 'turnstile_A',
      });

      // 1. Initial granted check-in at 15:00:00
      const firstResult = await handler.execute(command);
      expect(firstResult.getValue().isGranted).toBe(true);
      expect(repository.records).toHaveLength(1);

      // 2. Immediate second check-in at 15:01:00 (1 minute later)
      clock.setNow(new Date('2026-08-19T15:01:00.000Z'));
      const secondResult = await handler.execute(command);

      expect(secondResult.isSuccess).toBe(true);
      const dto2 = secondResult.getValue();
      expect(dto2.isGranted).toBe(false);
      expect(dto2.outcome).toBe(AccessResult.DENIED_DUPLICATE_CHECKIN);
      expect(dto2.isDuplicate).toBe(true);
      expect(dto2.denialReason).toContain('anti-passback cooldown window');

      // Both records exist in repository (first granted, second denied duplicate)
      expect(repository.records).toHaveLength(2);
      expect(repository.records[1]!.result).toBe(AccessResult.DENIED_DUPLICATE_CHECKIN);
    });

    it('3.2 Grants check-in when cooldown window (5 minutes) has elapsed', async () => {
      const command = new RecordCheckInCommand({
        clientId: 'client_passback_2',
        method: CheckInMethod.RFID,
      });

      // 1. Initial check-in at 15:00:00
      await handler.execute(command);

      // 2. Check-in after 6 minutes at 15:06:00
      clock.setNow(new Date('2026-08-19T15:06:00.000Z'));
      const secondResult = await handler.execute(command);

      expect(secondResult.isSuccess).toBe(true);
      expect(secondResult.getValue().isGranted).toBe(true);
      expect(secondResult.getValue().isDuplicate).toBe(false);
      expect(repository.records).toHaveLength(2);
      expect(repository.records[1]!.isGranted()).toBe(true);
    });

    it('3.3 A prior denied check-in does not trigger anti-passback', async () => {
      // First attempt is denied due to freeze
      eligibilityPort.eligibilityResponse = {
        isEligible: false,
        outcome: MembershipEligibilityOutcome.FROZEN,
        membershipId: 'mem_1',
        planId: 'plan_1',
        period: null,
        evaluatedAt: baseDate.toISOString(),
        reason: 'Frozen',
      };

      await handler.execute(
        new RecordCheckInCommand({
          clientId: 'client_retry',
          method: CheckInMethod.RFID,
        }),
      );

      // Membership unfrozen immediately, retry 30 seconds later
      eligibilityPort.eligibilityResponse = {
        isEligible: true,
        outcome: MembershipEligibilityOutcome.ELIGIBLE,
        membershipId: 'mem_1',
        planId: 'plan_1',
        period: null,
        evaluatedAt: baseDate.toISOString(),
        reason: 'Active',
      };
      clock.setNow(new Date('2026-08-19T15:00:30.000Z'));

      const retryResult = await handler.execute(
        new RecordCheckInCommand({
          clientId: 'client_retry',
          method: CheckInMethod.RFID,
        }),
      );

      expect(retryResult.isSuccess).toBe(true);
      expect(retryResult.getValue().isGranted).toBe(true);
      expect(retryResult.getValue().isDuplicate).toBe(false);
    });
  });

  describe('4. Idempotency & Network Retry Safety', () => {
    it('4.1 Replays identical response without creating duplicate entries when idempotencyKey matches', async () => {
      const command = new RecordCheckInCommand({
        clientId: 'client_idem_1',
        method: CheckInMethod.QR_CODE,
        idempotencyKey: 'idempotent_key_abc_123',
      });

      // 1. Initial invocation
      const res1 = await handler.execute(command);
      expect(res1.isSuccess).toBe(true);
      expect(res1.getValue().isGranted).toBe(true);
      expect(res1.getValue().isIdempotentReplay).toBe(false);
      expect(repository.records).toHaveLength(1);

      // 2. Retry invocation with identical idempotencyKey
      const res2 = await handler.execute(command);
      expect(res2.isSuccess).toBe(true);
      expect(res2.getValue().isGranted).toBe(true);
      expect(res2.getValue().isIdempotentReplay).toBe(true);
      expect(res2.getValue().attendanceId).toBe(res1.getValue().attendanceId);

      // Still only 1 record in repository
      expect(repository.records).toHaveLength(1);
    });
  });

  describe('5. Input Integrity & Error Handling', () => {
    it('5.1 Fails when clientId is missing or blank', async () => {
      const command = new RecordCheckInCommand({
        clientId: '   ',
        method: CheckInMethod.RFID,
      });

      const result = await handler.execute(command);
      expect(result.isFailure).toBe(true);
      expect(result.getError()).toContain('Client ID is required.');
    });

    it('5.2 Fails gracefully if repository throws an unhandled exception', async () => {
      jest.spyOn(repository, 'append').mockRejectedValueOnce(new Error('DB Connection Dropped'));

      const command = new RecordCheckInCommand({
        clientId: 'client_db_err',
        method: CheckInMethod.RFID,
      });

      const result = await handler.execute(command);
      expect(result.isFailure).toBe(true);
      expect(result.getError()).toContain('Failed to record check-in: DB Connection Dropped');
    });
  });
});
