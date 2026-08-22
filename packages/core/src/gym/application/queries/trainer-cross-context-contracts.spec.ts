import { GetAssignedClientMembershipsHandler } from './get-assigned-client-memberships.handler';
import { GetAssignedClientMembershipsQuery } from './get-assigned-client-memberships.query';
import { GetDailyAttendanceHandler } from './get-daily-attendance.handler';
import { GetDailyAttendanceQuery } from './get-daily-attendance.query';
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

describe('Phase 5.6-C: Trainer Dashboard Cross-Context Query Contracts, N+1 Prevention & Resilience Spec', () => {
  const baseTime = new Date('2026-08-22T10:00:00.000Z');
  let clock: TestClock;
  let membershipRepository: jest.Mocked<MembershipRepository>;
  let planRepository: jest.Mocked<MembershipPlanRepository>;
  let attendanceRepository: jest.Mocked<AttendanceRecordRepository>;
  let assignedHandler: GetAssignedClientMembershipsHandler;
  let attendanceHandler: GetDailyAttendanceHandler;

  const trainerId = 'trainer_usr_001';
  const planStandardId = 'plan_std_01';
  const planVipId = 'plan_vip_02';

  const createMembership = (id: string, clientId: string, plan: string): Membership => {
    return Membership.reconstitute({
      id: MembershipId.create(id),
      clientId,
      planId: plan,
      period: MembershipPeriod.create(
        new Date('2026-08-01T00:00:00.000Z'),
        new Date('2026-09-01T00:00:00.000Z'),
      ),
      status: MembershipStatus.ACTIVE,
      trainerAssignment: TrainerAssignment.create(trainerId, new Date('2026-08-01T00:00:00.000Z')),
      version: 1,
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    });
  };

  const createMockPlan = (id: string, code: string, name: string): MembershipPlan => {
    return MembershipPlan.reconstitute({
      id: PlanId.create(id),
      code: PlanCode.create(code),
      name,
      duration: PlanDuration.ofDays(30),
      price: PlanPrice.create(5000, 'USD'),
      status: PlanStatus.ACTIVE,
      version: 1,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    });
  };

  beforeEach(() => {
    clock = new TestClock(baseTime);

    membershipRepository = {
      save: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn(),
      findByClientId: jest.fn().mockResolvedValue([]),
      findExpiringCandidates: jest.fn().mockResolvedValue([]),
      findExpiringWithinHorizon: jest.fn().mockResolvedValue([]),
      findAll: jest.fn().mockResolvedValue([]),
      findByTrainerId: jest.fn().mockResolvedValue([]),
    };

    planRepository = {
      save: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn().mockImplementation(async (id: string | PlanId) => {
        const idStr = typeof id === 'string' ? id : id.value;
        if (idStr === planStandardId)
          return createMockPlan(planStandardId, 'STD_30', 'Standard Monthly');
        if (idStr === planVipId) return createMockPlan(planVipId, 'VIP_30', 'VIP Personal Pass');
        return null;
      }),
      findByCode: jest.fn(),
      findActive: jest.fn().mockResolvedValue([]),
    };

    attendanceRepository = {
      append: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn(),
      findByClientId: jest.fn().mockResolvedValue([]),
      findRecentByClientId: jest.fn().mockResolvedValue([]),
      findByGymDay: jest.fn().mockResolvedValue([]),
      countGrantedByGymDay: jest.fn().mockResolvedValue(0),
      countGrantedByClientAndGymDay: jest.fn().mockResolvedValue(0),
    };

    assignedHandler = new GetAssignedClientMembershipsHandler(
      membershipRepository,
      planRepository,
      clock,
    );

    attendanceHandler = new GetDailyAttendanceHandler(attendanceRepository, clock);
  });

  describe('1. N+1 Query Prevention & Plan Name Deduplication', () => {
    it('only calls planRepository.findById once per unique planId even with 50 assigned clients', async () => {
      // 50 assigned client memberships sharing 2 distinct plan IDs
      const memberships: Membership[] = [];
      for (let i = 1; i <= 50; i++) {
        const selectedPlan = i % 2 === 0 ? planStandardId : planVipId;
        memberships.push(createMembership(`mem_${i}`, `client_${i}`, selectedPlan));
      }

      membershipRepository.findByTrainerId = jest.fn().mockResolvedValue(memberships);

      const query = new GetAssignedClientMembershipsQuery({ trainerId });
      const result = await assignedHandler.execute(query);

      expect(result.isSuccess).toBe(true);
      expect(result.getValue()).toHaveLength(50);

      // Verify that findById was called exactly 2 times (once per unique planId), NOT 50 times
      expect(planRepository.findById).toHaveBeenCalledTimes(2);
      expect(planRepository.findById).toHaveBeenCalledWith(planStandardId);
      expect(planRepository.findById).toHaveBeenCalledWith(planVipId);
    });
  });

  describe('2. Partial Failure & Section Independence', () => {
    it('allows assigned client query to succeed even when plan lookup returns null fallback', async () => {
      const membership = createMembership(
        'mem_unknown',
        'client_unknown',
        'plan_deleted_or_missing',
      );
      membershipRepository.findByTrainerId = jest.fn().mockResolvedValue([membership]);

      const query = new GetAssignedClientMembershipsQuery({ trainerId });
      const result = await assignedHandler.execute(query);

      expect(result.isSuccess).toBe(true);
      const items = result.getValue();
      expect(items).toHaveLength(1);
      // Falls back safely to planId as planName without crashing
      expect(items[0]?.planName).toBe('plan_deleted_or_missing');
    });

    it('isolates attendance query failure without crashing membership projections', async () => {
      // Attendance repository fails
      attendanceRepository.findByGymDay.mockRejectedValue(
        new Error('Attendance database replica timeout'),
      );

      const attQuery = new GetDailyAttendanceQuery({ assignedClientIds: ['client_1'] });
      const attResult = await attendanceHandler.execute(attQuery);

      expect(attResult.isSuccess).toBe(false);
      expect(attResult.getError()).toContain('Attendance database replica timeout');

      // Meanwhile, assigned membership query executes independently and succeeds
      const mem1 = createMembership('mem_1', 'client_1', planStandardId);
      membershipRepository.findByTrainerId = jest.fn().mockResolvedValue([mem1]);

      const memQuery = new GetAssignedClientMembershipsQuery({ trainerId });
      const memResult = await assignedHandler.execute(memQuery);

      expect(memResult.isSuccess).toBe(true);
      expect(memResult.getValue()).toHaveLength(1);
    });
  });

  describe('3. Deterministic DTO Projection', () => {
    it('projects all required operational fields into AssignedClientMembershipDTO accurately', async () => {
      const mem = createMembership('mem_01', 'client_01', planStandardId);
      membershipRepository.findByTrainerId = jest.fn().mockResolvedValue([mem]);

      const query = new GetAssignedClientMembershipsQuery({ trainerId });
      const result = await assignedHandler.execute(query);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue()[0];
      expect(dto).toBeDefined();

      expect(dto?.membershipId).toBe('mem_01');
      expect(dto?.clientId).toBe('client_01');
      expect(dto?.planId).toBe(planStandardId);
      expect(dto?.planName).toBe('Standard Monthly');
      expect(dto?.status).toBe('ACTIVE');
      expect(dto?.daysRemaining).toBe(10);
      expect(dto?.isExpiringSoon).toBe(false);
      expect(dto?.isExpired).toBe(false);
      expect(dto?.isCurrentlyFrozen).toBe(false);
      expect(dto?.assignedAt).toBe('2026-08-01T00:00:00.000Z');
    });
  });
});
