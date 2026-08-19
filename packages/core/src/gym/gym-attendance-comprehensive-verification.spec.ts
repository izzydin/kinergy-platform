import { Clock } from './domain/shared/clock';
import { MembershipId } from './domain/membership/membership-id.vo';
import { MembershipPeriod } from './domain/membership/membership-period.vo';
import { FreezeWindow } from './domain/membership/freeze-window.vo';
import { Membership } from './domain/membership/membership.aggregate';
import { MembershipRepository } from './domain/repositories/membership.repository';
import { CheckMembershipEligibilityHandler } from './application/queries/check-membership-eligibility.handler';
import { RecordCheckInHandler } from './application/handlers/record-check-in.handler';
import { RecordCheckInCommand } from './application/commands/record-check-in.command';
import { AttendanceRecordRepository } from './domain/repositories/attendance-record.repository';
import { AttendanceRecord } from './domain/attendance/attendance-record.aggregate';
import { CheckInMethod } from './domain/attendance/check-in-method.enum';
import { AccessResult } from './domain/attendance/access-result.enum';
import { AttendanceId } from './domain/attendance/attendance-id.vo';
import { ClientLookupPort } from './application/ports/client-lookup.port';
import { GetDailyAttendanceHandler } from './application/queries/get-daily-attendance.handler';
import { GetDailyAttendanceQuery } from './application/queries/get-daily-attendance.query';
import { GetClientAttendanceHistoryHandler } from './application/queries/get-client-attendance-history.handler';
import { GetClientAttendanceHistoryQuery } from './application/queries/get-client-attendance-history.query';
import { GetAttendanceSummaryHandler } from './application/queries/get-attendance-summary.handler';
import { GetAttendanceSummaryQuery } from './application/queries/get-attendance-summary.query';
import { RecordCheckInResultDTO } from './application/dtos/record-check-in-result.dto';

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

  public async findByDateRange(
    startDate: Date,
    endDate: Date,
    facilityId?: string,
  ): Promise<AttendanceRecord[]> {
    return this.records
      .filter((r) => {
        const time = r.checkInTime.getTime();
        const inRange = time >= startDate.getTime() && time <= endDate.getTime();
        const matchesFacility = !facilityId || r.gymDay.facilityId === facilityId;
        return inRange && matchesFacility;
      })
      .sort((a, b) => b.checkInTime.getTime() - a.checkInTime.getTime());
  }
}

describe('Phase 5.5-H: Master Attendance & Daily Operations Comprehensive Verification Suite', () => {
  let clock: ControllableClock;
  let membershipsDb: Map<string, Membership>;
  let activeClients: Set<string>;
  let membershipRepo: MembershipRepository;
  let clientLookupPort: ClientLookupPort;
  let attendanceRepo: InMemoryAttendanceRepository;
  let eligibilityHandler: CheckMembershipEligibilityHandler;
  let checkInHandler: RecordCheckInHandler;

  const FIXED_NOW = new Date('2026-08-19T14:00:00.000Z');

  beforeEach(() => {
    clock = new ControllableClock(FIXED_NOW, 'America/Guayaquil');
    membershipsDb = new Map<string, Membership>();
    activeClients = new Set<string>();
    attendanceRepo = new InMemoryAttendanceRepository();

    membershipRepo = {
      save: jest.fn(async (m: Membership) => {
        membershipsDb.set(m.id.value, m);
      }),
      findById: jest.fn(async (id: MembershipId | string) => {
        const key = typeof id === 'string' ? id : id.value;
        return membershipsDb.get(key) ?? null;
      }),
      findByClientId: jest.fn(async (clientId: string) => {
        return Array.from(membershipsDb.values()).filter((m) => m.clientId === clientId);
      }),
      findExpiringCandidates: jest.fn(async () => []),
      findExpiringWithinHorizon: jest.fn(async () => []),
      findAll: jest.fn(async () => Array.from(membershipsDb.values())),
    };

    clientLookupPort = {
      validateClientExists: jest.fn(async (clientId: string) => activeClients.has(clientId)),
    };

    eligibilityHandler = new CheckMembershipEligibilityHandler(
      membershipRepo,
      clientLookupPort,
      clock,
    );

    checkInHandler = new RecordCheckInHandler(
      attendanceRepo,
      eligibilityHandler,
      clock,
      undefined,
      5 * 60 * 1000,
    );
  });

  // ============================================================================
  // 1. ELIGIBILITY MATRIX (All 8 Canonical Permutations)
  // ============================================================================
  describe('1. Authoritative Eligibility Matrix Permutations', () => {
    it('Permutation 1: Valid Client + ACTIVE + Within Validity -> GRANTED', async () => {
      const clientId = 'client_001';
      activeClients.add(clientId);

      const membership = Membership.create({
        id: MembershipId.create('mem_001'),
        clientId,
        planId: 'plan_gold',
        period: MembershipPeriod.create(
          new Date('2026-08-01T00:00:00.000Z'),
          new Date('2026-09-01T00:00:00.000Z'),
        ),
      });
      await membershipRepo.save(membership);

      const command = new RecordCheckInCommand({
        clientId,
        method: CheckInMethod.RFID,
      });
      const result = await checkInHandler.execute(command);

      expect(result.isSuccess).toBe(true);
      const data = result.getValue();
      expect(data.isGranted).toBe(true);
      expect(data.outcome).toBe(AccessResult.GRANTED);
      expect(data.membershipId).toBe('mem_001');
      expect(data.planId).toBe('plan_gold');
    });

    it('Permutation 2: Valid Client + EXPIRED Membership -> DENIED_EXPIRED', async () => {
      const clientId = 'client_002';
      activeClients.add(clientId);

      const membership = Membership.create({
        id: MembershipId.create('mem_002'),
        clientId,
        planId: 'plan_gold',
        period: MembershipPeriod.create(
          new Date('2026-07-01T00:00:00.000Z'),
          new Date('2026-08-01T00:00:00.000Z'),
        ),
      });
      membership.expire(clock);
      await membershipRepo.save(membership);

      const command = new RecordCheckInCommand({
        clientId,
        method: CheckInMethod.MANUAL_RECEPTION,
      });
      const result = await checkInHandler.execute(command);

      expect(result.isSuccess).toBe(true);
      const data = result.getValue();
      expect(data.isGranted).toBe(false);
      expect(data.outcome).toBe(AccessResult.DENIED_EXPIRED);
      expect(data.denialReason).toContain('expired');
    });

    it('Permutation 3: Valid Client + SUSPENDED / FROZEN Membership -> DENIED_FROZEN', async () => {
      const clientId = 'client_003';
      activeClients.add(clientId);

      const membership = Membership.create({
        id: MembershipId.create('mem_003'),
        clientId,
        planId: 'plan_gold',
        period: MembershipPeriod.create(
          new Date('2026-08-01T00:00:00.000Z'),
          new Date('2026-09-01T00:00:00.000Z'),
        ),
      });
      membership.freeze(
        FreezeWindow.create(
          new Date('2026-08-10T00:00:00.000Z'),
          new Date('2026-08-25T00:00:00.000Z'),
          'Medical leave',
        ),
        clock,
      );
      await membershipRepo.save(membership);

      const command = new RecordCheckInCommand({
        clientId,
        method: CheckInMethod.QR_CODE,
      });
      const result = await checkInHandler.execute(command);

      expect(result.isSuccess).toBe(true);
      const data = result.getValue();
      expect(data.isGranted).toBe(false);
      expect(data.outcome).toBe(AccessResult.DENIED_FROZEN);
      expect(data.denialReason).toContain('frozen');
    });

    it('Permutation 4: Valid Client + CANCELLED / TERMINATED Membership -> DENIED_NO_MEMBERSHIP', async () => {
      const clientId = 'client_004';
      activeClients.add(clientId);

      const membership = Membership.create({
        id: MembershipId.create('mem_004'),
        clientId,
        planId: 'plan_gold',
        period: MembershipPeriod.create(
          new Date('2026-08-01T00:00:00.000Z'),
          new Date('2026-09-01T00:00:00.000Z'),
        ),
      });
      membership.terminate('Member requested cancellation', clock);
      await membershipRepo.save(membership);

      const command = new RecordCheckInCommand({
        clientId,
        method: CheckInMethod.RFID,
      });
      const result = await checkInHandler.execute(command);

      expect(result.isSuccess).toBe(true);
      const data = result.getValue();
      expect(data.isGranted).toBe(false);
      expect(data.outcome).toBe(AccessResult.DENIED_NO_MEMBERSHIP);
    });

    it('Permutation 5: Valid Client + NOT_YET_ACTIVE (Future) Membership -> DENIED_NO_MEMBERSHIP', async () => {
      const clientId = 'client_005';
      activeClients.add(clientId);

      const membership = Membership.create({
        id: MembershipId.create('mem_005'),
        clientId,
        planId: 'plan_gold',
        period: MembershipPeriod.create(
          new Date('2026-09-01T00:00:00.000Z'),
          new Date('2026-10-01T00:00:00.000Z'),
        ),
      });
      await membershipRepo.save(membership);

      const command = new RecordCheckInCommand({
        clientId,
        method: CheckInMethod.BARCODE,
      });
      const result = await checkInHandler.execute(command);

      expect(result.isSuccess).toBe(true);
      const data = result.getValue();
      expect(data.isGranted).toBe(false);
      expect(data.outcome).toBe(AccessResult.DENIED_NO_MEMBERSHIP);
      expect(data.denialReason).toContain('not started yet');
    });

    it('Permutation 6: Valid Client + No Membership on Record -> DENIED_NO_MEMBERSHIP', async () => {
      const clientId = 'client_006';
      activeClients.add(clientId);

      const command = new RecordCheckInCommand({
        clientId,
        method: CheckInMethod.BIOMETRIC,
      });
      const result = await checkInHandler.execute(command);

      expect(result.isSuccess).toBe(true);
      const data = result.getValue();
      expect(data.isGranted).toBe(false);
      expect(data.outcome).toBe(AccessResult.DENIED_NO_MEMBERSHIP);
      expect(data.denialReason).toContain('does not have any membership');
    });

    it('Permutation 7: Inactive / Terminated Client -> DENIED_INACTIVE_CLIENT', async () => {
      const clientId = 'client_007';
      // NOT added to activeClients

      const membership = Membership.create({
        id: MembershipId.create('mem_007'),
        clientId,
        planId: 'plan_gold',
        period: MembershipPeriod.create(
          new Date('2026-08-01T00:00:00.000Z'),
          new Date('2026-09-01T00:00:00.000Z'),
        ),
      });
      await membershipRepo.save(membership);

      const command = new RecordCheckInCommand({
        clientId,
        method: CheckInMethod.RFID,
      });
      const result = await checkInHandler.execute(command);

      expect(result.isSuccess).toBe(true);
      const data = result.getValue();
      expect(data.isGranted).toBe(false);
      expect(data.outcome).toBe(AccessResult.DENIED_INACTIVE_CLIENT);
      expect(data.denialReason).toContain('inactive standing');
    });

    it('Permutation 8: Valid Client with Multiple Memberships -> Selects deterministic active eligible membership', async () => {
      const clientId = 'client_008';
      activeClients.add(clientId);

      // Expired membership
      const oldMembership = Membership.create({
        id: MembershipId.create('mem_old'),
        clientId,
        planId: 'plan_gold',
        period: MembershipPeriod.create(
          new Date('2026-07-01T00:00:00.000Z'),
          new Date('2026-08-01T00:00:00.000Z'),
        ),
      });
      oldMembership.expire(clock);
      await membershipRepo.save(oldMembership);

      // Active renewed membership
      const activeMembership = Membership.create({
        id: MembershipId.create('mem_current'),
        clientId,
        planId: 'plan_gold',
        period: MembershipPeriod.create(
          new Date('2026-08-01T00:00:00.000Z'),
          new Date('2026-09-01T00:00:00.000Z'),
        ),
      });
      await membershipRepo.save(activeMembership);

      const command = new RecordCheckInCommand({
        clientId,
        method: CheckInMethod.RFID,
      });
      const result = await checkInHandler.execute(command);

      expect(result.isSuccess).toBe(true);
      const data = result.getValue();
      expect(data.isGranted).toBe(true);
      expect(data.outcome).toBe(AccessResult.GRANTED);
      expect(data.membershipId).toBe('mem_current');
    });
  });

  // ============================================================================
  // 2. BOUNDARY-TIME & TEMPORAL PRECISION TESTS
  // ============================================================================
  describe('2. Temporal Boundary Precision (1ms Before, Exact, 1ms After)', () => {
    const expirationInstant = new Date('2026-08-31T23:59:59.999Z');
    const clientId = 'client_boundary';

    beforeEach(async () => {
      activeClients.add(clientId);
      const membership = Membership.create({
        id: MembershipId.create('mem_boundary'),
        clientId,
        planId: 'plan_gold',
        period: MembershipPeriod.create(new Date('2026-08-01T00:00:00.000Z'), expirationInstant),
      });
      await membershipRepo.save(membership);
    });

    it('admissions 1ms before expiration boundary are GRANTED', async () => {
      const oneMsBefore = new Date(expirationInstant.getTime() - 1);
      clock.setNow(oneMsBefore);

      const result = await checkInHandler.execute(
        new RecordCheckInCommand({
          clientId,
          method: CheckInMethod.RFID,
        }),
      );

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().isGranted).toBe(true);
      expect(result.getValue().outcome).toBe(AccessResult.GRANTED);
    });

    it('admissions exactly at expiration boundary (instant >= endDate) are DENIED_EXPIRED', async () => {
      clock.setNow(expirationInstant);

      const result = await checkInHandler.execute(
        new RecordCheckInCommand({
          clientId,
          method: CheckInMethod.RFID,
        }),
      );

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().isGranted).toBe(false);
      expect(result.getValue().outcome).toBe(AccessResult.DENIED_EXPIRED);
    });

    it('admissions 1ms after expiration boundary are DENIED_EXPIRED', async () => {
      const oneMsAfter = new Date(expirationInstant.getTime() + 1);
      clock.setNow(oneMsAfter);

      const result = await checkInHandler.execute(
        new RecordCheckInCommand({
          clientId,
          method: CheckInMethod.RFID,
        }),
      );

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().isGranted).toBe(false);
      expect(result.getValue().outcome).toBe(AccessResult.DENIED_EXPIRED);
    });
  });

  // ============================================================================
  // 3. MIDNIGHT & GYM FACILITY TIMEZONE TRANSITIONS
  // ============================================================================
  describe('3. Facility Timezone & Midnight Business Date Boundaries', () => {
    const clientId = 'client_midnight';

    beforeEach(async () => {
      activeClients.add(clientId);
      const membership = Membership.create({
        id: MembershipId.create('mem_midnight'),
        clientId,
        planId: 'plan_gold',
        period: MembershipPeriod.create(
          new Date('2026-08-01T00:00:00.000Z'),
          new Date('2026-09-01T00:00:00.000Z'),
        ),
      });
      await membershipRepo.save(membership);
    });

    it('correctly maps 23:59:59.999 Guayaquil local time (UTC-5) to current local GymDay', async () => {
      // 2026-08-19 23:59:59.999 local in UTC-5 is 2026-08-20T04:59:59.999Z
      const localLateNight = new Date('2026-08-20T04:59:59.999Z');
      clock.setNow(localLateNight);

      const result = await checkInHandler.execute(
        new RecordCheckInCommand({
          clientId,
          method: CheckInMethod.MANUAL_RECEPTION,
          facilityId: 'facility_main',
        }),
      );

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().isGranted).toBe(true);
      expect(result.getValue().gymDay.localDate).toBe('2026-08-19');
    });

    it('correctly maps 00:00:00.000 Guayaquil local time (UTC-5) to the next local GymDay', async () => {
      // 2026-08-20 00:00:00.000 local in UTC-5 is 2026-08-20T05:00:00.000Z
      const localMidnight = new Date('2026-08-20T05:00:00.000Z');
      clock.setNow(localMidnight);

      const result = await checkInHandler.execute(
        new RecordCheckInCommand({
          clientId,
          method: CheckInMethod.MANUAL_RECEPTION,
          facilityId: 'facility_main',
        }),
      );

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().isGranted).toBe(true);
      expect(result.getValue().gymDay.localDate).toBe('2026-08-20');
    });
  });

  // ============================================================================
  // 4. DUPLICATE CHECK-IN & ANTI-PASSBACK COOLDOWN POLICY
  // ============================================================================
  describe('4. Duplicate Check-In & Anti-Passback Policy', () => {
    const clientId = 'client_passback';

    beforeEach(async () => {
      activeClients.add(clientId);
      const membership = Membership.create({
        id: MembershipId.create('mem_passback'),
        clientId,
        planId: 'plan_gold',
        period: MembershipPeriod.create(
          new Date('2026-08-01T00:00:00.000Z'),
          new Date('2026-09-01T00:00:00.000Z'),
        ),
      });
      await membershipRepo.save(membership);
    });

    it('rejects immediate second scan within 5-minute cooldown as DENIED_DUPLICATE_CHECKIN', async () => {
      const initialScanTime = new Date('2026-08-19T10:00:00.000Z');
      clock.setNow(initialScanTime);

      const firstResult = await checkInHandler.execute(
        new RecordCheckInCommand({ clientId, method: CheckInMethod.RFID }),
      );
      expect(firstResult.getValue().isGranted).toBe(true);

      // Re-scan 2 minutes later
      clock.setNow(new Date('2026-08-19T10:02:00.000Z'));
      const duplicateResult = await checkInHandler.execute(
        new RecordCheckInCommand({ clientId, method: CheckInMethod.RFID }),
      );

      expect(duplicateResult.isSuccess).toBe(true);
      const data = duplicateResult.getValue();
      expect(data.isGranted).toBe(false);
      expect(data.outcome).toBe(AccessResult.DENIED_DUPLICATE_CHECKIN);
      expect(data.isDuplicate).toBe(true);
      expect(data.denialReason).toContain('anti-passback');
    });

    it('grants second admission after 5-minute anti-passback cooldown on the same business day', async () => {
      clock.setNow(new Date('2026-08-19T10:00:00.000Z'));
      await checkInHandler.execute(
        new RecordCheckInCommand({ clientId, method: CheckInMethod.RFID }),
      );

      // Re-entry 6 minutes later
      clock.setNow(new Date('2026-08-19T10:06:00.000Z'));
      const secondAdmission = await checkInHandler.execute(
        new RecordCheckInCommand({ clientId, method: CheckInMethod.RFID }),
      );

      expect(secondAdmission.isSuccess).toBe(true);
      const data = secondAdmission.getValue();
      expect(data.isGranted).toBe(true);
      expect(data.outcome).toBe(AccessResult.GRANTED);
      expect(data.isDuplicate).toBe(false);
    });
  });

  // ============================================================================
  // 5. CONCURRENCY MUTEX & SIMULTANEOUS INGRESS RACE CONDITIONS
  // ============================================================================
  describe('5. High-Concurrency Mutex & Race Condition Verification', () => {
    it('safely serializes 10 concurrent check-in attempts for the same client: exactly 1 GRANTED and 9 DENIED_DUPLICATE_CHECKIN', async () => {
      const clientId = 'client_race_condition';
      activeClients.add(clientId);

      const membership = Membership.create({
        id: MembershipId.create('mem_race'),
        clientId,
        planId: 'plan_gold',
        period: MembershipPeriod.create(
          new Date('2026-08-01T00:00:00.000Z'),
          new Date('2026-09-01T00:00:00.000Z'),
        ),
      });
      await membershipRepo.save(membership);

      // Launch 10 simultaneous requests
      const promises = Array.from({ length: 10 }).map((_, index) =>
        checkInHandler.execute(
          new RecordCheckInCommand({
            clientId,
            method: CheckInMethod.RFID,
            gateId: `turnstile_${index + 1}`,
          }),
        ),
      );

      const appResults = await Promise.all(promises);
      const results = appResults.map((r) => r.getValue());

      const grantedCount = results.filter((r: RecordCheckInResultDTO) => r.isGranted).length;
      const duplicateDeniedCount = results.filter(
        (r: RecordCheckInResultDTO) => r.outcome === AccessResult.DENIED_DUPLICATE_CHECKIN,
      ).length;

      expect(grantedCount).toBe(1);
      expect(duplicateDeniedCount).toBe(9);
      expect(results.length).toBe(10);
    });

    it('safely handles concurrent check-ins across 5 different clients in parallel with zero contention', async () => {
      const clientIds = ['cli_A', 'cli_B', 'cli_C', 'cli_D', 'cli_E'];

      for (const cId of clientIds) {
        activeClients.add(cId);
        const mem = Membership.create({
          id: MembershipId.create(`mem_${cId}`),
          clientId: cId,
          planId: 'plan_gold',
          period: MembershipPeriod.create(
            new Date('2026-08-01T00:00:00.000Z'),
            new Date('2026-09-01T00:00:00.000Z'),
          ),
        });
        await membershipRepo.save(mem);
      }

      const promises = clientIds.map((cId) =>
        checkInHandler.execute(
          new RecordCheckInCommand({
            clientId: cId,
            method: CheckInMethod.QR_CODE,
          }),
        ),
      );

      const appResults = await Promise.all(promises);
      const results = appResults.map((r) => r.getValue());

      expect(results.every((r: RecordCheckInResultDTO) => r.isGranted)).toBe(true);
      expect(results.length).toBe(5);
    });
  });

  // ============================================================================
  // 6. IDEMPOTENCY NONCE & CLIENT RETRY SAFETY
  // ============================================================================
  describe('6. Idempotency Key & Client Retry Safety', () => {
    it('returns the exact cached admission result with isIdempotentReplay=true on repeated submission without adding duplicate records', async () => {
      const clientId = 'client_retry';
      activeClients.add(clientId);

      const membership = Membership.create({
        id: MembershipId.create('mem_retry'),
        clientId,
        planId: 'plan_gold',
        period: MembershipPeriod.create(
          new Date('2026-08-01T00:00:00.000Z'),
          new Date('2026-09-01T00:00:00.000Z'),
        ),
      });
      await membershipRepo.save(membership);

      const idempotencyKey = 'nonce_term_1_req_789';

      const firstResponse = await checkInHandler.execute(
        new RecordCheckInCommand({
          clientId,
          method: CheckInMethod.RFID,
          idempotencyKey,
        }),
      );

      expect(firstResponse.isSuccess).toBe(true);
      const firstData = firstResponse.getValue();
      expect(firstData.isGranted).toBe(true);
      expect(firstData.isIdempotentReplay).toBe(false);

      // Client retries submission with same idempotency nonce
      const secondResponse = await checkInHandler.execute(
        new RecordCheckInCommand({
          clientId,
          method: CheckInMethod.RFID,
          idempotencyKey,
        }),
      );

      expect(secondResponse.isSuccess).toBe(true);
      const secondData = secondResponse.getValue();
      expect(secondData.isGranted).toBe(true);
      expect(secondData.isIdempotentReplay).toBe(true);
      expect(secondData.attendanceId).toBe(firstData.attendanceId);
      expect(secondData.checkInTime).toBe(firstData.checkInTime);

      // Verify only 1 physical record was appended to the repository
      expect(attendanceRepo.records.filter((r) => r.clientId === clientId).length).toBe(1);
    });
  });

  // ============================================================================
  // 7. HISTORICAL IMMUTABILITY (Subsequent Lifecycle Mutation Resistance)
  // ============================================================================
  describe('7. Historical Immutability & Audit Integrity', () => {
    it('historical Attendance records remain immutable after subsequent Membership renewals, plan changes, and expirations', async () => {
      const clientId = 'client_historical';
      activeClients.add(clientId);

      const membership = Membership.create({
        id: MembershipId.create('mem_hist'),
        clientId,
        planId: 'plan_gold',
        period: MembershipPeriod.create(
          new Date('2026-08-01T00:00:00.000Z'),
          new Date('2026-09-01T00:00:00.000Z'),
        ),
      });
      await membershipRepo.save(membership);

      // Record check-in in August
      const checkInResult = await checkInHandler.execute(
        new RecordCheckInCommand({
          clientId,
          method: CheckInMethod.RFID,
          gateId: 'turnstile_east',
          notes: 'August admission',
        }),
      );

      const attendanceId = checkInResult.getValue().attendanceId;
      expect(attendanceId).not.toBeNull();
      const initialRecord = await attendanceRepo.findById(attendanceId!);
      expect(initialRecord).not.toBeNull();
      expect(initialRecord?.membershipId).toBe('mem_hist');
      expect(initialRecord?.result).toBe(AccessResult.GRANTED);

      // Subsequent lifecycle mutations on Membership
      clock.setNow(new Date('2026-09-05T00:00:00.000Z'));
      membership.expire(clock);
      await membershipRepo.save(membership);

      membership.renew(
        MembershipPeriod.create(
          new Date('2026-09-05T00:00:00.000Z'),
          new Date('2026-10-05T00:00:00.000Z'),
        ),
        clock,
      );
      await membershipRepo.save(membership);

      activeClients.delete(clientId);

      // Assert historical attendance record is completely unchanged
      const historicalRecord = await attendanceRepo.findById(attendanceId!);

      expect(historicalRecord?.id.value).toBe(attendanceId);
      expect(historicalRecord?.clientId).toBe(clientId);
      expect(historicalRecord?.membershipId).toBe('mem_hist');
      expect(historicalRecord?.result).toBe(AccessResult.GRANTED);
      expect(historicalRecord?.gateId).toBe('turnstile_east');
      expect(historicalRecord?.notes).toBe('August admission');
      expect(historicalRecord?.checkInTime.toISOString()).toBe(FIXED_NOW.toISOString());
    });
  });

  // ============================================================================
  // 8. OPERATIONAL READ MODELS & QUERY PROJECTIONS
  // ============================================================================
  describe('8. Operational Read Model Query Verification', () => {
    let getDailyAttendanceHandler: GetDailyAttendanceHandler;
    let getClientHistoryHandler: GetClientAttendanceHistoryHandler;
    let getAttendanceSummaryHandler: GetAttendanceSummaryHandler;

    beforeEach(async () => {
      getDailyAttendanceHandler = new GetDailyAttendanceHandler(attendanceRepo, clock);
      getClientHistoryHandler = new GetClientAttendanceHistoryHandler(attendanceRepo);
      getAttendanceSummaryHandler = new GetAttendanceSummaryHandler(attendanceRepo, clock);

      // Seed 3 check-ins across 2 clients
      activeClients.add('client_q1');
      activeClients.add('client_q2');

      const memQ1 = Membership.create({
        id: MembershipId.create('mem_q1'),
        clientId: 'client_q1',
        planId: 'plan_gold',
        period: MembershipPeriod.create(
          new Date('2026-08-01T00:00:00.000Z'),
          new Date('2026-09-01T00:00:00.000Z'),
        ),
      });
      await membershipRepo.save(memQ1);

      // Check-in 1: Granted
      clock.setNow(new Date('2026-08-19T09:00:00.000Z'));
      await checkInHandler.execute(
        new RecordCheckInCommand({
          clientId: 'client_q1',
          method: CheckInMethod.RFID,
          facilityId: 'facility_main',
        }),
      );

      // Check-in 2: Denied duplicate
      clock.setNow(new Date('2026-08-19T09:02:00.000Z'));
      await checkInHandler.execute(
        new RecordCheckInCommand({
          clientId: 'client_q1',
          method: CheckInMethod.RFID,
          facilityId: 'facility_main',
        }),
      );

      // Check-in 3: Denied no membership for client_q2
      clock.setNow(new Date('2026-08-19T10:00:00.000Z'));
      await checkInHandler.execute(
        new RecordCheckInCommand({
          clientId: 'client_q2',
          method: CheckInMethod.MANUAL_RECEPTION,
          facilityId: 'facility_main',
        }),
      );
    });

    it('GetDailyAttendanceQuery: returns accurate items, daily KPI counts, and pagination metadata', async () => {
      clock.setNow(new Date('2026-08-19T15:00:00.000Z'));

      const result = await getDailyAttendanceHandler.execute(
        new GetDailyAttendanceQuery({
          facilityId: 'facility_main',
          page: 1,
          limit: 10,
        }),
      );

      expect(result.isSuccess).toBe(true);
      const data = result.getValue();
      expect(data.items.length).toBe(3);
      expect(data.pagination.totalItems).toBe(3);
      expect(data.pagination.totalPages).toBe(1);

      expect(data.dailySummary).toBeDefined();
      expect(data.dailySummary?.totalCheckIns).toBe(3);
      expect(data.dailySummary?.grantedCount).toBe(1);
      expect(data.dailySummary?.deniedCount).toBe(2);
      expect(data.dailySummary?.uniqueClientsCount).toBe(1);
    });

    it('GetClientAttendanceHistoryQuery: returns chronological history and calculated metrics for member profile', async () => {
      const result = await getClientHistoryHandler.execute(
        new GetClientAttendanceHistoryQuery({
          clientId: 'client_q1',
          page: 1,
          limit: 10,
        }),
      );

      expect(result.isSuccess).toBe(true);
      const data = result.getValue();
      expect(data.items.length).toBe(2);
      expect(data.pagination.totalItems).toBe(2);
      expect(data.items[0]?.result).toBe(AccessResult.DENIED_DUPLICATE_CHECKIN);
      expect(data.items[1]?.result).toBe(AccessResult.GRANTED);
    });

    it('GetAttendanceSummaryQuery: aggregates range metrics, peak ingress hours, and ingress channel breakdowns', async () => {
      const result = await getAttendanceSummaryHandler.execute(
        new GetAttendanceSummaryQuery({
          startDate: '2026-08-18',
          endDate: '2026-08-20',
          facilityId: 'facility_main',
        }),
      );

      expect(result.isSuccess).toBe(true);
      const data = result.getValue();
      expect(data.totalGrantedVisits).toBe(1);
      expect(data.totalDeniedAttempts).toBe(2);
      expect(data.totalUniqueVisitors).toBe(1);
      expect(data.dailyBreakdown.length).toBe(3); // 2026-08-18, 2026-08-19, 2026-08-20
      const day19 = data.dailyBreakdown.find((d) => d.gymDay === '2026-08-19');
      expect(day19).toBeDefined();
      expect(day19!.byMethod[CheckInMethod.RFID]).toBe(2);
      expect(day19!.byMethod[CheckInMethod.MANUAL_RECEPTION]).toBe(1);
    });
  });
});
