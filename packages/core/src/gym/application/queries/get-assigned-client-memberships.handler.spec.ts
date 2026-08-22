import { GetAssignedClientMembershipsHandler } from './get-assigned-client-memberships.handler';
import { GetAssignedClientMembershipsQuery } from './get-assigned-client-memberships.query';
import { MembershipRepository } from '../../domain/repositories/membership.repository';
import { MembershipPlanRepository } from '../../domain/repositories/membership-plan.repository';
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

describe('GetAssignedClientMembershipsHandler (Phase 5.6-A)', () => {
  const baseTime = new Date('2026-08-22T10:00:00.000Z');
  let clock: TestClock;
  let membershipRepository: jest.Mocked<MembershipRepository>;
  let planRepository: jest.Mocked<MembershipPlanRepository>;
  let handler: GetAssignedClientMembershipsHandler;

  const trainerId = 'trainer_usr_001';
  const planStandardId = 'plan_std_01';
  const planVipId = 'plan_vip_02';

  const createMembershipWithTrainer = (
    id: string,
    clientId: string,
    assignedTrainer: string,
    planId: string,
    status: MembershipStatus,
    startDate: Date,
    endDate: Date,
  ): Membership => {
    return Membership.reconstitute({
      id: MembershipId.create(id),
      clientId,
      planId,
      period: MembershipPeriod.create(startDate, endDate),
      status,
      trainerAssignment: TrainerAssignment.create(assignedTrainer, startDate),
      version: 1,
      createdAt: startDate,
      updatedAt: startDate,
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
        if (idStr === planVipId)
          return createMockPlan(planVipId, 'VIP_30', 'VIP Personal Training');
        return null;
      }),
      findByCode: jest.fn(),
      findActive: jest.fn().mockResolvedValue([]),
    };

    handler = new GetAssignedClientMembershipsHandler(membershipRepository, planRepository, clock);
  });

  it('should reject query when trainerId is missing or empty', async () => {
    const query = new GetAssignedClientMembershipsQuery({ trainerId: '' });
    const result = await handler.execute(query);

    expect(result.isSuccess).toBe(false);
    expect(result.getError()).toContain('trainerId is required');
  });

  it('should project assigned client memberships with plan names and derived expiry indicators', async () => {
    // Current clock: 2026-08-22
    // Client 1: Expires in 3 days (2026-08-25) -> isExpiringSoon = true
    const mem1 = createMembershipWithTrainer(
      'mem_001',
      'client_alpha',
      trainerId,
      planStandardId,
      MembershipStatus.ACTIVE,
      new Date('2026-07-25T00:00:00.000Z'),
      new Date('2026-08-25T00:00:00.000Z'),
    );

    // Client 2: Expires in 20 days (2026-09-11) -> isExpiringSoon = false
    const mem2 = createMembershipWithTrainer(
      'mem_002',
      'client_beta',
      trainerId,
      planVipId,
      MembershipStatus.ACTIVE,
      new Date('2026-08-11T00:00:00.000Z'),
      new Date('2026-09-11T00:00:00.000Z'),
    );

    membershipRepository.findByTrainerId = jest.fn().mockResolvedValue([mem2, mem1]);

    const query = new GetAssignedClientMembershipsQuery({ trainerId });
    const result = await handler.execute(query);

    expect(result.isSuccess).toBe(true);
    const items = result.getValue();
    expect(items).toHaveLength(2);

    // Expiring soon items should sort first
    expect(items[0]?.membershipId).toBe('mem_001');
    expect(items[0]?.clientId).toBe('client_alpha');
    expect(items[0]?.planName).toBe('Standard Monthly');
    expect(items[0]?.daysRemaining).toBe(3);
    expect(items[0]?.isExpiringSoon).toBe(true);
    expect(items[0]?.isExpired).toBe(false);

    expect(items[1]?.membershipId).toBe('mem_002');
    expect(items[1]?.clientId).toBe('client_beta');
    expect(items[1]?.planName).toBe('VIP Personal Training');
    expect(items[1]?.daysRemaining).toBe(20);
    expect(items[1]?.isExpiringSoon).toBe(false);
  });
});
