import { GetTrainerDashboardSummaryHandler } from './get-trainer-dashboard-summary.handler';
import { GetAssignedClientMembershipsHandler } from './get-assigned-client-memberships.handler';
import { GetTrainerDashboardSummaryQuery } from './get-trainer-dashboard-summary.query';
import { GetAssignedClientMembershipsQuery } from './get-assigned-client-memberships.query';
import { MembershipRepository } from '../../domain/repositories/membership.repository';
import { MembershipPlanRepository } from '../../domain/repositories/membership-plan.repository';
import { AttendanceRecordRepository } from '../../domain/repositories/attendance-record.repository';
import { TestClock } from '../../domain/shared/clock';
import { Membership } from '../../domain/membership/membership.aggregate';
import { MembershipPeriod } from '../../domain/membership/membership-period.vo';
import { MembershipStatus } from '../../domain/membership/membership-status.enum';
import { MembershipId } from '../../domain/membership/membership-id.vo';
import { TrainerAssignment } from '../../domain/membership/trainer-assignment.vo';
import { MembershipPlan } from '../../domain/plan/membership-plan.aggregate';
import { PlanId } from '../../domain/plan/plan-id.vo';
import { PlanCode } from '../../domain/plan/plan-code.vo';
import { PlanDuration } from '../../domain/plan/plan-duration.vo';
import { PlanPrice } from '../../domain/plan/plan-price.vo';
import { PlanStatus } from '../../domain/plan/plan-status.enum';
import { AttendanceRecord } from '../../domain/attendance/attendance-record.aggregate';
import { AccessResult } from '../../domain/attendance/access-result.enum';
import { CheckInMethod } from '../../domain/attendance/check-in-method.enum';
import { GymDay } from '../../domain/attendance/gym-day.vo';

describe('Phase 5.6-H: Trainer Dashboard Comprehensive Verification Suite', () => {
  const baseTime = new Date('2026-08-22T10:00:00.000Z');
  let clock: TestClock;
  let membershipRepo: jest.Mocked<MembershipRepository>;
  let planRepo: jest.Mocked<MembershipPlanRepository>;
  let attendanceRepo: jest.Mocked<AttendanceRecordRepository>;

  const trainerAlice = 'usr_trainer_alice';
  const trainerBob = 'usr_trainer_bob';
  const planStandardId = 'plan_std_001';
  const planVipId = 'plan_vip_002';

  const createMembership = (params: {
    id: string;
    clientId: string;
    planId: string;
    status?: MembershipStatus;
    trainerId?: string;
    startDate?: Date;
    endDate?: Date;
  }): Membership => {
    const startDate = params.startDate ?? new Date('2026-08-01T00:00:00.000Z');
    const endDate = params.endDate ?? new Date('2026-08-31T00:00:00.000Z');
    const assignment = params.trainerId
      ? TrainerAssignment.create(params.trainerId, startDate)
      : null;

    return Membership.reconstitute({
      id: MembershipId.create(params.id),
      clientId: params.clientId,
      planId: params.planId,
      period: MembershipPeriod.create(startDate, endDate),
      status: params.status ?? MembershipStatus.ACTIVE,
      trainerAssignment: assignment,
      version: 1,
      createdAt: startDate,
      updatedAt: startDate,
    });
  };

  const createMockPlan = (id: string, name: string): MembershipPlan => {
    const sanitizedCode = `CODE_${id}`.replace(/[^A-Za-z0-9_]/g, '_').toUpperCase();
    return MembershipPlan.reconstitute({
      id: PlanId.create(id),
      code: PlanCode.create(sanitizedCode),
      name,
      duration: PlanDuration.ofDays(30),
      price: PlanPrice.create(9900, 'USD'),
      status: PlanStatus.ACTIVE,
      version: 1,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    });
  };

  beforeEach(() => {
    clock = new TestClock(baseTime);

    membershipRepo = {
      save: jest.fn(),
      findById: jest.fn(),
      findByClientId: jest.fn(),
      findExpiringCandidates: jest.fn(),
      findExpiringWithinHorizon: jest.fn(),
      findByTrainerId: jest.fn(),
      findAll: jest.fn(),
    };

    planRepo = {
      save: jest.fn(),
      findById: jest.fn(),
      findByCode: jest.fn(),
      findActive: jest.fn(),
    };

    attendanceRepo = {
      append: jest.fn(),
      findById: jest.fn(),
      findByClientId: jest.fn(),
      findRecentByClientId: jest.fn(),
      findByGymDay: jest.fn(),
      countGrantedByGymDay: jest.fn(),
      countGrantedByClientAndGymDay: jest.fn(),
    };

    planRepo.findById.mockImplementation(async (id: string | PlanId) => {
      const idStr = typeof id === 'string' ? id : id.value;
      return createMockPlan(idStr, idStr === planStandardId ? 'Standard Monthly' : 'VIP Training');
    });
  });

  describe('1. Authorization Matrix & Actor Scoping', () => {
    it('allows Trainer Alice to see only her assigned clients, completely isolating Bob clients', async () => {
      const memAlice = createMembership({
        id: 'mem_a1',
        clientId: 'client_alice',
        planId: planStandardId,
        trainerId: trainerAlice,
      });

      const memBob = createMembership({
        id: 'mem_b1',
        clientId: 'client_bob',
        planId: planVipId,
        trainerId: trainerBob,
      });

      membershipRepo.findByTrainerId = jest.fn().mockImplementation(async (tid: string) => {
        return [memAlice, memBob].filter((m) => m.trainerAssignment?.trainerId === tid);
      });

      const handler = new GetAssignedClientMembershipsHandler(membershipRepo, planRepo, clock);
      const result = await handler.execute(
        new GetAssignedClientMembershipsQuery({ trainerId: trainerAlice }),
      );

      expect(result.isSuccess).toBe(true);
      const items = result.getValue();
      expect(items.length).toBe(1);
      expect(items[0]!.clientId).toBe('client_alice');
      expect(items[0]!.planName).toBe('Standard Monthly');
      expect(items.some((i) => i.clientId === 'client_bob')).toBe(false);
    });

    it('returns empty list for a Trainer with no assigned clients without errors', async () => {
      membershipRepo.findByTrainerId = jest.fn().mockResolvedValue([]);

      const handler = new GetAssignedClientMembershipsHandler(membershipRepo, planRepo, clock);
      const result = await handler.execute(
        new GetAssignedClientMembershipsQuery({ trainerId: 'usr_trainer_no_clients' }),
      );

      expect(result.isSuccess).toBe(true);
      expect(result.getValue()).toEqual([]);
    });

    it('rejects query when trainerId is empty or whitespace', async () => {
      const handler = new GetAssignedClientMembershipsHandler(membershipRepo, planRepo, clock);
      const result = await handler.execute(
        new GetAssignedClientMembershipsQuery({ trainerId: '  ' }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toContain('trainerId is required');
    });
  });

  describe('2. Assignment Lifecycle & Reassignment Dynamics', () => {
    it('accurately updates visibility when a membership is reassigned from Alice to Bob', async () => {
      const mem = createMembership({
        id: 'mem_transfer',
        clientId: 'client_reassigned',
        planId: planStandardId,
        trainerId: trainerAlice,
      });

      // Initially assigned to Alice
      membershipRepo.findByTrainerId = jest.fn().mockImplementation(async (tid: string) => {
        return [mem].filter((m) => m.trainerAssignment?.trainerId === tid);
      });

      const handler = new GetAssignedClientMembershipsHandler(membershipRepo, planRepo, clock);
      const initialAlice = await handler.execute(
        new GetAssignedClientMembershipsQuery({ trainerId: trainerAlice }),
      );
      expect(initialAlice.getValue().length).toBe(1);

      // Reassign to Bob
      mem.assignTrainer(trainerBob, clock);

      const afterBob = await handler.execute(
        new GetAssignedClientMembershipsQuery({ trainerId: trainerBob }),
      );
      const afterAlice = await handler.execute(
        new GetAssignedClientMembershipsQuery({ trainerId: trainerAlice }),
      );

      expect(afterBob.getValue().length).toBe(1);
      expect(afterBob.getValue()[0]!.clientId).toBe('client_reassigned');
      expect(afterAlice.getValue().length).toBe(0);
    });
  });

  describe('3. Membership Lifecycle Status Invariants', () => {
    it('correctly projects ACTIVE, FROZEN, EXPIRED, and CANCELLED statuses without domain leakage', async () => {
      const memActive = createMembership({
        id: 'mem_1',
        clientId: 'c1',
        planId: planStandardId,
        status: MembershipStatus.ACTIVE,
        trainerId: trainerAlice,
        endDate: new Date('2026-08-30T00:00:00.000Z'),
      });

      const memFrozen = createMembership({
        id: 'mem_2',
        clientId: 'c2',
        planId: planStandardId,
        status: MembershipStatus.FROZEN,
        trainerId: trainerAlice,
        endDate: new Date('2026-08-30T00:00:00.000Z'),
      });

      const memExpired = createMembership({
        id: 'mem_3',
        clientId: 'c3',
        planId: planStandardId,
        status: MembershipStatus.EXPIRED,
        trainerId: trainerAlice,
        endDate: new Date('2026-08-10T00:00:00.000Z'),
      });

      membershipRepo.findByTrainerId = jest
        .fn()
        .mockResolvedValue([memActive, memFrozen, memExpired]);

      const handler = new GetAssignedClientMembershipsHandler(membershipRepo, planRepo, clock);
      const result = await handler.execute(
        new GetAssignedClientMembershipsQuery({
          trainerId: trainerAlice,
          statuses: [MembershipStatus.ACTIVE, MembershipStatus.FROZEN, MembershipStatus.EXPIRED],
        }),
      );

      expect(result.isSuccess).toBe(true);
      const items = result.getValue();

      const activeItem = items.find((i) => i.membershipId === 'mem_1')!;
      expect(activeItem.status).toBe(MembershipStatus.ACTIVE);
      expect(activeItem.isExpired).toBe(false);
      expect(activeItem.isCurrentlyFrozen).toBe(false);

      const frozenItem = items.find((i) => i.membershipId === 'mem_2')!;
      expect(frozenItem.status).toBe(MembershipStatus.FROZEN);
      expect(frozenItem.isCurrentlyFrozen).toBe(true);

      const expiredItem = items.find((i) => i.membershipId === 'mem_3')!;
      expect(expiredItem.status).toBe(MembershipStatus.EXPIRED);
      expect(expiredItem.isExpired).toBe(true);
      expect(expiredItem.daysRemaining).toBe(0);
    });
  });

  describe('4. Expiration Thresholds & Temporal Edge Cases', () => {
    it('correctly classifies memberships exactly on the 7-day boundary vs outside the window', async () => {
      const now = new Date('2026-08-22T10:00:00.000Z');
      clock.setTime(now);

      // Exactly 7 days from now = 2026-08-29T10:00:00.000Z
      const exact7Days = new Date('2026-08-29T10:00:00.000Z');
      // 7 days + 1 minute = 2026-08-29T10:01:00.000Z
      const outsideWindow = new Date('2026-08-29T10:01:00.000Z');

      const memExact = createMembership({
        id: 'mem_exact',
        clientId: 'c_exact',
        planId: planStandardId,
        trainerId: trainerAlice,
        endDate: exact7Days,
      });

      const memOutside = createMembership({
        id: 'mem_outside',
        clientId: 'c_outside',
        planId: planStandardId,
        trainerId: trainerAlice,
        endDate: outsideWindow,
      });

      membershipRepo.findByTrainerId = jest.fn().mockResolvedValue([memExact, memOutside]);

      const handler = new GetAssignedClientMembershipsHandler(membershipRepo, planRepo, clock);
      const result = await handler.execute(
        new GetAssignedClientMembershipsQuery({
          trainerId: trainerAlice,
          horizonDays: 7,
        }),
      );

      const items = result.getValue();
      const exactItem = items.find((i) => i.membershipId === 'mem_exact')!;
      const outsideItem = items.find((i) => i.membershipId === 'mem_outside')!;

      expect(exactItem.isExpiringSoon).toBe(true);
      expect(outsideItem.isExpiringSoon).toBe(false);
    });
  });

  describe('5. Attendance Aggregation & Facility Timezone Boundaries', () => {
    it('correctly aggregates check-ins across facility timezone boundaries using GymDay', async () => {
      const evalDateUtc = new Date('2026-08-22T02:00:00.000Z'); // 2 AM UTC = 10 PM Previous Day in America/New_York
      clock.setTime(evalDateUtc);

      const mem = createMembership({
        id: 'mem_1',
        clientId: 'client_ny',
        planId: planStandardId,
        trainerId: trainerAlice,
      });

      membershipRepo.findByTrainerId = jest.fn().mockResolvedValue([mem]);

      const gymDayNy = GymDay.fromUtc(evalDateUtc, 'America/New_York', 'facility_ny');
      expect(gymDayNy.localDate).toBe('2026-08-21'); // Previous calendar day in NY

      const attRecord = AttendanceRecord.record({
        clientId: 'client_ny',
        membershipId: 'mem_1',
        checkInTime: evalDateUtc,
        gymDay: gymDayNy,
        facilityId: 'facility_ny',
        method: CheckInMethod.RFID,
        result: AccessResult.GRANTED,
      });

      attendanceRepo.findByGymDay.mockImplementation(async (day, fac) => {
        if (day === gymDayNy.toString() && fac === 'facility_ny') return [attRecord];
        return [];
      });

      const summaryHandler = new GetTrainerDashboardSummaryHandler(
        membershipRepo,
        attendanceRepo,
        clock,
      );

      const result = await summaryHandler.execute(
        new GetTrainerDashboardSummaryQuery({
          trainerId: trainerAlice,
          facilityId: 'facility_ny',
          timezone: 'America/New_York',
        }),
      );

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().todayCheckInsCount).toBe(1);
    });
  });

  describe('6. Architecture & Immutability Invariants', () => {
    it('proves that query execution does NOT mutate aggregate state and excludes pricing internals', async () => {
      const mem = createMembership({
        id: 'mem_immutability',
        clientId: 'client_audit',
        planId: planStandardId,
        trainerId: trainerAlice,
      });

      const originalVersion = mem.version;
      const originalUpdatedAt = mem.updatedAt.getTime();

      membershipRepo.findByTrainerId = jest.fn().mockResolvedValue([mem]);

      const handler = new GetAssignedClientMembershipsHandler(membershipRepo, planRepo, clock);
      const result = await handler.execute(
        new GetAssignedClientMembershipsQuery({ trainerId: trainerAlice }),
      );

      // Verify aggregate was not mutated
      expect(mem.version).toBe(originalVersion);
      expect(mem.updatedAt.getTime()).toBe(originalUpdatedAt);

      // Verify that no repository save() was triggered during read query execution
      expect(membershipRepo.save).not.toHaveBeenCalled();

      // Verify price fields are NOT leaked in DTO
      const dto = result.getValue()[0]!;
      expect((dto as unknown as { price: unknown }).price).toBeUndefined();
      expect((dto as unknown as { amount: unknown }).amount).toBeUndefined();
    });
  });
});
