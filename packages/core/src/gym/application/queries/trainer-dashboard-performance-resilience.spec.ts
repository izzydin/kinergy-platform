import { GetAssignedClientMembershipsHandler } from './get-assigned-client-memberships.handler';
import { GetTrainerDashboardSummaryHandler } from './get-trainer-dashboard-summary.handler';
import { GetAssignedClientMembershipsQuery } from './get-assigned-client-memberships.query';
import { GetTrainerDashboardSummaryQuery } from './get-trainer-dashboard-summary.query';
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

describe('Phase 5.6-G: Trainer Dashboard Performance, Pagination & Resilience Spec', () => {
  let membershipRepo: jest.Mocked<MembershipRepository>;
  let planRepo: jest.Mocked<MembershipPlanRepository>;
  let attendanceRepo: jest.Mocked<AttendanceRecordRepository>;
  let clock: TestClock;

  const baseDate = new Date('2026-08-22T10:00:00.000Z');

  const createMembership = (
    id: string,
    clientId: string,
    planId: string,
    trainerId = 'trainer_007',
    startDate = new Date('2026-08-01T00:00:00.000Z'),
    endDate = new Date('2026-08-31T00:00:00.000Z'),
  ): Membership => {
    return Membership.reconstitute({
      id: MembershipId.create(id),
      clientId,
      planId,
      period: MembershipPeriod.create(startDate, endDate),
      status: MembershipStatus.ACTIVE,
      trainerAssignment: TrainerAssignment.create(trainerId, startDate),
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
    clock = new TestClock(baseDate);

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
  });

  describe('1. N+1 Query Elimination & Plan Cache Batching', () => {
    it('executes exactly 1 plan lookup per unique plan ID across 50 assigned client memberships', async () => {
      // Create 50 memberships referencing only 3 distinct plans (plan_A, plan_B, plan_C)
      const plans = ['plan_A', 'plan_B', 'plan_C'];
      const mockMemberships: Membership[] = [];

      for (let i = 1; i <= 50; i++) {
        const assignedPlan = plans[i % 3]!;
        mockMemberships.push(
          createMembership(`mem_${i}`, `client_${i}`, assignedPlan, 'trainer_007'),
        );
      }

      membershipRepo.findByTrainerId = jest.fn().mockResolvedValue(mockMemberships);

      planRepo.findById.mockImplementation(async (id: string | PlanId) => {
        const idStr = typeof id === 'string' ? id : id.value;
        return createMockPlan(idStr, `Plan Name for ${idStr}`);
      });

      const handler = new GetAssignedClientMembershipsHandler(membershipRepo, planRepo, clock);
      const query = new GetAssignedClientMembershipsQuery({
        trainerId: 'trainer_007',
      });

      const result = await handler.execute(query);

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().length).toBe(50);

      // Verify that planRepo.findById was called only 3 times despite 50 memberships (O(1) unique plans)
      expect(planRepo.findById).toHaveBeenCalledTimes(3);
      expect(planRepo.findById).toHaveBeenCalledWith('plan_A');
      expect(planRepo.findById).toHaveBeenCalledWith('plan_B');
      expect(planRepo.findById).toHaveBeenCalledWith('plan_C');
    });
  });

  describe('2. Deterministic Pagination & Tie-Breaking Stability', () => {
    it('guarantees zero duplicate items and stable page boundary splits across pages with identical expiry dates', async () => {
      // 20 memberships all expiring on the exact same date
      const mockMemberships: Membership[] = [];
      for (let i = 1; i <= 20; i++) {
        mockMemberships.push(
          createMembership(
            `mem_${String(i).padStart(3, '0')}`,
            `client_${i}`,
            'plan_std',
            'trainer_007',
            new Date('2026-08-01T00:00:00.000Z'),
            new Date('2026-08-29T00:00:00.000Z'),
          ),
        );
      }

      membershipRepo.findByTrainerId = jest.fn().mockResolvedValue(mockMemberships);
      planRepo.findById.mockResolvedValue(null);

      const handler = new GetAssignedClientMembershipsHandler(membershipRepo, planRepo, clock);

      // Fetch Page 1 (limit 10)
      const page1Result = await handler.execute(
        new GetAssignedClientMembershipsQuery({
          trainerId: 'trainer_007',
          page: 1,
          limit: 10,
          sortBy: 'daysRemaining',
          sortOrder: 'ASC',
        }),
      );

      // Fetch Page 2 (limit 10)
      const page2Result = await handler.execute(
        new GetAssignedClientMembershipsQuery({
          trainerId: 'trainer_007',
          page: 2,
          limit: 10,
          sortBy: 'daysRemaining',
          sortOrder: 'ASC',
        }),
      );

      expect(page1Result.isSuccess).toBe(true);
      expect(page2Result.isSuccess).toBe(true);

      const page1Items = page1Result.getValue();
      const page2Items = page2Result.getValue();

      expect(page1Items.length).toBe(10);
      expect(page2Items.length).toBe(10);

      // Check that no IDs overlap between Page 1 and Page 2
      const page1Ids = new Set(page1Items.map((i) => i.membershipId));
      const page2Ids = new Set(page2Items.map((i) => i.membershipId));

      for (const id of page2Ids) {
        expect(page1Ids.has(id)).toBe(false);
      }

      // Verify deterministic secondary sorting by membershipId
      expect(page1Items[0]!.membershipId).toBe('mem_001');
      expect(page1Items[9]!.membershipId).toBe('mem_010');
      expect(page2Items[0]!.membershipId).toBe('mem_011');
      expect(page2Items[9]!.membershipId).toBe('mem_020');
    });

    it('enforces maximum page size clamping at 100 items', async () => {
      const mockMemberships: Membership[] = [];
      for (let i = 1; i <= 150; i++) {
        mockMemberships.push(
          createMembership(
            `mem_${i}`,
            `client_${i}`,
            'plan_std',
            'trainer_007',
            new Date('2026-08-01T00:00:00.000Z'),
            new Date('2026-08-30T00:00:00.000Z'),
          ),
        );
      }

      membershipRepo.findByTrainerId = jest.fn().mockResolvedValue(mockMemberships);
      planRepo.findById.mockResolvedValue(null);

      const handler = new GetAssignedClientMembershipsHandler(membershipRepo, planRepo, clock);

      // Request limit of 500
      const result = await handler.execute(
        new GetAssignedClientMembershipsQuery({
          trainerId: 'trainer_007',
          page: 1,
          limit: 500,
        }),
      );

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().length).toBe(100); // Clamped to max 100
    });
  });

  describe('3. Failure Resilience & Graceful Partial Degradation', () => {
    it('gracefully degrades to planId when plan lookup returns null or fails without crashing the query', async () => {
      const mem = createMembership('mem_001', 'client_alpha', 'plan_missing_or_failed');

      membershipRepo.findByTrainerId = jest.fn().mockResolvedValue([mem]);
      planRepo.findById.mockResolvedValue(null); // Missing or transient repository failure

      const handler = new GetAssignedClientMembershipsHandler(membershipRepo, planRepo, clock);
      const result = await handler.execute(
        new GetAssignedClientMembershipsQuery({ trainerId: 'trainer_007' }),
      );

      expect(result.isSuccess).toBe(true);
      const items = result.getValue();
      expect(items.length).toBe(1);
      expect(items[0]!.planName).toBe('plan_missing_or_failed'); // Safe fallback
    });

    it('returns ApplicationResult.fail when invalid date string is passed without throwing uncaught exceptions', async () => {
      const handler = new GetAssignedClientMembershipsHandler(membershipRepo, planRepo, clock);
      const result = await handler.execute(
        new GetAssignedClientMembershipsQuery({
          trainerId: 'trainer_007',
          asOfDate: 'not-a-valid-date',
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toContain("Invalid asOfDate 'not-a-valid-date'");
    });

    it('isolates trainer data so Trainer A never sees Trainer B records in summary KPIs', async () => {
      const memA = createMembership('mem_A', 'client_A', 'plan_std', 'trainer_A');
      const memB = createMembership('mem_B', 'client_B', 'plan_vip', 'trainer_B');

      membershipRepo.findByTrainerId = jest.fn().mockImplementation(async (tid: string) => {
        return [memA, memB].filter((m) => m.trainerAssignment?.trainerId === tid);
      });
      attendanceRepo.findByGymDay.mockResolvedValue([]);

      const summaryHandler = new GetTrainerDashboardSummaryHandler(
        membershipRepo,
        attendanceRepo,
        clock,
      );

      const resultA = await summaryHandler.execute(
        new GetTrainerDashboardSummaryQuery({ trainerId: 'trainer_A' }),
      );

      expect(resultA.isSuccess).toBe(true);
      expect(resultA.getValue().totalAssignedClients).toBe(1);
      expect(resultA.getValue().trainerId).toBe('trainer_A');
    });
  });

  describe('4. Attendance Aggregation Scalability', () => {
    it('efficiently calculates today granted check-ins using GymDay partition and clientId hash sets', async () => {
      const mem1 = createMembership('mem_1', 'client_1', 'plan_std', 'trainer_007');

      membershipRepo.findByTrainerId = jest.fn().mockResolvedValue([mem1]);

      const gymDay = GymDay.fromUtc(clock.now(), 'UTC', 'main');
      const att1 = AttendanceRecord.record({
        clientId: 'client_1',
        membershipId: mem1.id.value,
        checkInTime: clock.now(),
        gymDay,
        facilityId: 'main',
        method: CheckInMethod.RFID,
        result: AccessResult.GRANTED,
      });

      const attOther = AttendanceRecord.record({
        clientId: 'client_unassigned',
        membershipId: 'mem_other',
        checkInTime: clock.now(),
        gymDay,
        facilityId: 'main',
        method: CheckInMethod.QR_CODE,
        result: AccessResult.GRANTED,
      });

      attendanceRepo.findByGymDay.mockResolvedValue([att1, attOther]);

      const summaryHandler = new GetTrainerDashboardSummaryHandler(
        membershipRepo,
        attendanceRepo,
        clock,
      );

      const summaryResult = await summaryHandler.execute(
        new GetTrainerDashboardSummaryQuery({
          trainerId: 'trainer_007',
        }),
      );

      expect(summaryResult.isSuccess).toBe(true);
      // Only client_1 (assigned to trainer_007) is counted
      expect(summaryResult.getValue().todayCheckInsCount).toBe(1);
    });
  });
});
