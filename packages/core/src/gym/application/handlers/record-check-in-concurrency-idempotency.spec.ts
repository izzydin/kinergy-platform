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

class ControllableClock implements Clock {
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

class ThreadSafeAsyncAttendanceRepository implements AttendanceRecordRepository {
  public records: AttendanceRecord[] = [];

  public async append(record: AttendanceRecord): Promise<void> {
    // Simulate real async I/O latency (2-5ms) to test concurrency locks
    await new Promise((resolve) => setTimeout(resolve, 2));
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

class FastEligibilityPort implements MembershipEligibilityPort {
  public eligibilityMap = new Map<string, MembershipEligibilityResultDTO>();

  public setClientEligibility(clientId: string, result: MembershipEligibilityResultDTO): void {
    this.eligibilityMap.set(clientId, result);
  }

  public async evaluateEligibility(
    clientId: string,
    _asOf?: Date,
  ): Promise<MembershipEligibilityResultDTO> {
    // Small simulated async lookup latency
    await new Promise((resolve) => setTimeout(resolve, 1));
    return (
      this.eligibilityMap.get(clientId) ?? {
        isEligible: true,
        outcome: MembershipEligibilityOutcome.ELIGIBLE,
        membershipId: `mem_${clientId}`,
        planId: 'plan_unlimited_gold',
        period: {
          startDate: '2026-08-01T00:00:00.000Z',
          endDate: '2026-09-01T00:00:00.000Z',
        },
        evaluatedAt: '2026-08-19T10:00:00.000Z',
        reason: 'Active valid membership',
      }
    );
  }
}

class RecordingEventPublisher implements GymEventPublisherPort {
  public publishedEvents: DomainEvent[] = [];

  public async publish(events: ReadonlyArray<DomainEvent>): Promise<void> {
    this.publishedEvents.push(...events);
  }
}

describe('Phase 5.5-E: RecordCheckInHandler Concurrency, Anti-Passback & Idempotency Hardening', () => {
  let repository: ThreadSafeAsyncAttendanceRepository;
  let eligibilityPort: FastEligibilityPort;
  let eventPublisher: RecordingEventPublisher;
  let clock: ControllableClock;
  let handler: RecordCheckInHandler;

  const baseDate = new Date('2026-08-19T10:00:00.000Z');

  beforeEach(() => {
    repository = new ThreadSafeAsyncAttendanceRepository();
    eligibilityPort = new FastEligibilityPort();
    eventPublisher = new RecordingEventPublisher();
    clock = new ControllableClock(baseDate, 'America/Guayaquil');
    handler = new RecordCheckInHandler(repository, eligibilityPort, clock, eventPublisher);
  });

  describe('1. High-Concurrency Race Conditions (Simultaneous Scanners)', () => {
    it('1.1 Guarantees exactly ONE GRANTED entry when 10 concurrent requests arrive simultaneously for the same client', async () => {
      const clientId = 'client_concurrent_100';

      // Launch 10 simultaneous check-ins across multiple simulated gates
      const promises = Array.from({ length: 10 }, (_, i) =>
        handler.execute(
          new RecordCheckInCommand({
            clientId,
            method: CheckInMethod.RFID,
            gateId: `turnstile_gate_${i + 1}`,
          }),
        ),
      );

      const results = await Promise.all(promises);

      // Verify all promises resolved successfully with ApplicationResult.ok
      for (const res of results) {
        expect(res.isSuccess).toBe(true);
      }

      const grantedResults = results.filter((r) => r.getValue().isGranted);
      const deniedResults = results.filter(
        (r) => r.getValue().outcome === AccessResult.DENIED_DUPLICATE_CHECKIN,
      );

      expect(grantedResults).toHaveLength(1);
      expect(deniedResults).toHaveLength(9);

      // Verify repository persistence: 1 granted + 9 denied audit records
      expect(repository.records).toHaveLength(10);
      const grantedRecords = repository.records.filter((r) => r.isGranted());
      expect(grantedRecords).toHaveLength(1);
    });

    it('1.2 Allows simultaneous concurrent check-ins for DIFFERENT clients without cross-blocking', async () => {
      const clientIds = ['client_A', 'client_B', 'client_C', 'client_D', 'client_E'];

      const promises = clientIds.map((clientId, i) =>
        handler.execute(
          new RecordCheckInCommand({
            clientId,
            method: CheckInMethod.QR_CODE,
            gateId: `turnstile_${i + 1}`,
          }),
        ),
      );

      const results = await Promise.all(promises);

      // All 5 different clients must be GRANTED
      for (const res of results) {
        expect(res.isSuccess).toBe(true);
        expect(res.getValue().isGranted).toBe(true);
        expect(res.getValue().outcome).toBe(AccessResult.GRANTED);
      }

      expect(repository.records).toHaveLength(5);
      expect(repository.records.every((r) => r.isGranted())).toBe(true);
    });
  });

  describe('2. Anti-Passback Temporal Window Boundaries', () => {
    it('2.1 Rejects check-in at 4m 59s and permits at 5m 01s after prior granted entry', async () => {
      const clientId = 'client_boundary_test';
      const command = new RecordCheckInCommand({
        clientId,
        method: CheckInMethod.RFID,
      });

      // 1. Initial entry at 10:00:00
      const res1 = await handler.execute(command);
      expect(res1.getValue().isGranted).toBe(true);

      // 2. Scan at 10:04:59 (4 min 59 sec later -> within 5m cooldown)
      clock.setNow(new Date('2026-08-19T10:04:59.000Z'));
      const res2 = await handler.execute(command);
      expect(res2.getValue().isGranted).toBe(false);
      expect(res2.getValue().outcome).toBe(AccessResult.DENIED_DUPLICATE_CHECKIN);
      expect(res2.getValue().isDuplicate).toBe(true);

      // 3. Scan at 10:05:01 (5 min 01 sec later -> cooldown elapsed)
      clock.setNow(new Date('2026-08-19T10:05:01.000Z'));
      const res3 = await handler.execute(command);
      expect(res3.getValue().isGranted).toBe(true);
      expect(res3.getValue().outcome).toBe(AccessResult.GRANTED);
      expect(res3.getValue().isDuplicate).toBe(false);

      expect(repository.records).toHaveLength(3);
    });

    it('2.2 Permits valid multiple check-ins on the same day (e.g. morning workout and evening session)', async () => {
      const clientId = 'client_multi_visit';
      const command = new RecordCheckInCommand({
        clientId,
        method: CheckInMethod.RFID,
      });

      // Morning visit at 08:00 (13:00 UTC)
      clock.setNow(new Date('2026-08-19T13:00:00.000Z'));
      const morningRes = await handler.execute(command);
      expect(morningRes.getValue().isGranted).toBe(true);
      expect(morningRes.getValue().gymDay.localDate).toBe('2026-08-19');

      // Evening visit at 18:00 (23:00 UTC)
      clock.setNow(new Date('2026-08-19T23:00:00.000Z'));
      const eveningRes = await handler.execute(command);
      expect(eveningRes.getValue().isGranted).toBe(true);
      expect(eveningRes.getValue().gymDay.localDate).toBe('2026-08-19');

      // Total granted for client on this GymDay is 2
      const dayCount = await repository.countGrantedByClientAndGymDay(clientId, '2026-08-19');
      expect(dayCount).toBe(2);
    });
  });

  describe('3. Request Idempotency & Network Retry Safety', () => {
    it('3.1 Safely handles 10 concurrent requests sharing the same idempotencyKey', async () => {
      const clientId = 'client_retry_idem';
      const idempotencyKey = 'unique_turnstile_scan_nonce_999';

      const promises = Array.from({ length: 10 }, () =>
        handler.execute(
          new RecordCheckInCommand({
            clientId,
            method: CheckInMethod.QR_CODE,
            idempotencyKey,
          }),
        ),
      );

      const results = await Promise.all(promises);

      for (const res of results) {
        expect(res.isSuccess).toBe(true);
        expect(res.getValue().isGranted).toBe(true);
      }

      // Exactly 1 database record persisted
      expect(repository.records).toHaveLength(1);

      // Replays have isIdempotentReplay: true
      const replays = results.filter((r) => r.getValue().isIdempotentReplay);
      expect(replays.length).toBeGreaterThanOrEqual(9);
    });
  });

  describe('4. Rapid Recovery After Denial (Zero False Lockouts)', () => {
    it('4.1 Allows immediate granted check-in when client resolves freeze or payment 5 seconds after denial', async () => {
      const clientId = 'client_frozen_recovery';

      // 1. Initial attempt: Frozen account at 10:00:00
      eligibilityPort.setClientEligibility(clientId, {
        isEligible: false,
        outcome: MembershipEligibilityOutcome.FROZEN,
        membershipId: 'mem_1',
        planId: 'plan_1',
        period: null,
        evaluatedAt: baseDate.toISOString(),
        reason: 'Membership is currently suspended under freeze.',
      });

      const res1 = await handler.execute(
        new RecordCheckInCommand({
          clientId,
          method: CheckInMethod.RFID,
        }),
      );
      expect(res1.getValue().isGranted).toBe(false);
      expect(res1.getValue().outcome).toBe(AccessResult.DENIED_FROZEN);

      // 2. Staff unfreezes client account at reception.
      eligibilityPort.setClientEligibility(clientId, {
        isEligible: true,
        outcome: MembershipEligibilityOutcome.ELIGIBLE,
        membershipId: 'mem_1',
        planId: 'plan_1',
        period: null,
        evaluatedAt: baseDate.toISOString(),
        reason: 'Active valid membership',
      });

      // 3. Retry 5 seconds later at 10:00:05
      clock.setNow(new Date('2026-08-19T10:00:05.000Z'));
      const res2 = await handler.execute(
        new RecordCheckInCommand({
          clientId,
          method: CheckInMethod.RFID,
        }),
      );

      // Succeeded! Prior denial did not trigger false anti-passback
      expect(res2.getValue().isGranted).toBe(true);
      expect(res2.getValue().outcome).toBe(AccessResult.GRANTED);
      expect(res2.getValue().isDuplicate).toBe(false);
    });
  });
});
