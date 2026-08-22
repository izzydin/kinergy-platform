import { GetMembershipByIdHandler } from './get-membership-by-id.handler';
import { ListMembershipsByClientHandler } from './list-memberships-by-client.handler';
import { GetMembershipPlanByIdHandler } from './get-membership-plan-by-id.handler';
import { ListMembershipPlansHandler } from './list-membership-plans.handler';
import { GetMembershipByIdQuery } from './get-membership-by-id.query';
import { ListMembershipsByClientQuery } from './list-memberships-by-client.query';
import { GetMembershipPlanByIdQuery } from './get-membership-plan-by-id.query';
import { ListMembershipPlansQuery } from './list-membership-plans.query';
import { MembershipRepository } from '../../domain/repositories/membership.repository';
import { MembershipPlanRepository } from '../../domain/repositories/membership-plan.repository';
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

describe('Phase 5.7-A: Membership and Plan Application Queries Spec', () => {
  let membershipRepo: jest.Mocked<MembershipRepository>;
  let planRepo: jest.Mocked<MembershipPlanRepository>;

  const baseTime = new Date('2026-08-22T10:00:00.000Z');

  const createMembership = (id = 'mem_001', clientId = 'client_001'): Membership => {
    return Membership.reconstitute({
      id: MembershipId.create(id),
      clientId,
      planId: 'plan_001',
      period: MembershipPeriod.create(
        new Date('2026-08-01T00:00:00.000Z'),
        new Date('2026-08-31T00:00:00.000Z'),
      ),
      status: MembershipStatus.ACTIVE,
      trainerAssignment: TrainerAssignment.create('trainer_007', new Date('2026-08-01')),
      version: 1,
      createdAt: baseTime,
      updatedAt: baseTime,
    });
  };

  const createMockPlan = (id = 'plan_001', status = PlanStatus.ACTIVE): MembershipPlan => {
    return MembershipPlan.reconstitute({
      id: PlanId.create(id),
      code: PlanCode.create('STD_MONTHLY'),
      name: 'Standard Monthly Plan',
      description: 'Standard access',
      duration: PlanDuration.ofDays(30),
      price: PlanPrice.create(4999, 'USD'),
      status,
      version: 1,
      createdAt: baseTime,
      updatedAt: baseTime,
    });
  };

  beforeEach(() => {
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
      findAll: jest.fn(),
    } as unknown as jest.Mocked<MembershipPlanRepository>;
  });

  describe('1. GetMembershipByIdHandler', () => {
    it('returns MembershipDTO when found', async () => {
      const mem = createMembership();
      membershipRepo.findById.mockResolvedValue(mem);

      const handler = new GetMembershipByIdHandler(membershipRepo);
      const result = await handler.execute(new GetMembershipByIdQuery({ membershipId: 'mem_001' }));

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().id).toBe('mem_001');
      expect(result.getValue().clientId).toBe('client_001');
    });

    it('fails when membership does not exist', async () => {
      membershipRepo.findById.mockResolvedValue(null);

      const handler = new GetMembershipByIdHandler(membershipRepo);
      const result = await handler.execute(
        new GetMembershipByIdQuery({ membershipId: 'mem_missing' }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toContain("Membership with ID 'mem_missing' not found.");
    });
  });

  describe('2. ListMembershipsByClientHandler', () => {
    it('returns all memberships associated with client', async () => {
      const mem1 = createMembership('mem_001', 'client_001');
      const mem2 = createMembership('mem_002', 'client_001');
      membershipRepo.findByClientId.mockResolvedValue([mem1, mem2]);

      const handler = new ListMembershipsByClientHandler(membershipRepo);
      const result = await handler.execute(
        new ListMembershipsByClientQuery({ clientId: 'client_001' }),
      );

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().length).toBe(2);
      expect(result.getValue()[0]!.id).toBe('mem_001');
      expect(result.getValue()[1]!.id).toBe('mem_002');
    });
  });

  describe('3. GetMembershipPlanByIdHandler', () => {
    it('returns MembershipPlanDTO when found', async () => {
      const plan = createMockPlan();
      planRepo.findById.mockResolvedValue(plan);

      const handler = new GetMembershipPlanByIdHandler(planRepo);
      const result = await handler.execute(new GetMembershipPlanByIdQuery({ planId: 'plan_001' }));

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().id).toBe('plan_001');
      expect(result.getValue().name).toBe('Standard Monthly Plan');
    });

    it('fails when plan does not exist', async () => {
      planRepo.findById.mockResolvedValue(null);

      const handler = new GetMembershipPlanByIdHandler(planRepo);
      const result = await handler.execute(
        new GetMembershipPlanByIdQuery({ planId: 'plan_missing' }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toContain("Membership plan with ID 'plan_missing' not found.");
    });
  });

  describe('4. ListMembershipPlansHandler', () => {
    it('returns active plans when activeOnly is requested', async () => {
      const plan = createMockPlan();
      planRepo.findActive.mockResolvedValue([plan]);

      const handler = new ListMembershipPlansHandler(planRepo);
      const result = await handler.execute(new ListMembershipPlansQuery({ activeOnly: true }));

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().items.length).toBe(1);
      expect(result.getValue().total).toBe(1);
      expect(planRepo.findActive).toHaveBeenCalledTimes(1);
    });

    it('returns all plans when activeOnly is false', async () => {
      const plan1 = createMockPlan('plan_01', PlanStatus.ACTIVE);
      const plan2 = createMockPlan('plan_02', PlanStatus.DRAFT);
      (planRepo.findAll as jest.Mock).mockResolvedValue([plan1, plan2]);

      const handler = new ListMembershipPlansHandler(planRepo);
      const result = await handler.execute(new ListMembershipPlansQuery({ activeOnly: false }));

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().items.length).toBe(2);
      expect(result.getValue().total).toBe(2);
    });
  });
});
