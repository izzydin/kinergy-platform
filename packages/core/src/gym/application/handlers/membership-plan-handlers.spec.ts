import { CreateMembershipPlanHandler } from './create-membership-plan.handler';
import { UpdateMembershipPlanPricingHandler } from './update-membership-plan-pricing.handler';
import { PublishMembershipPlanHandler } from './publish-membership-plan.handler';
import { ArchiveMembershipPlanHandler } from './archive-membership-plan.handler';
import { CreateMembershipPlanCommand } from '../commands/create-membership-plan.command';
import { UpdateMembershipPlanPricingCommand } from '../commands/update-membership-plan-pricing.command';
import { PublishMembershipPlanCommand } from '../commands/publish-membership-plan.command';
import { ArchiveMembershipPlanCommand } from '../commands/archive-membership-plan.command';
import { MembershipPlanRepository } from '../../domain/repositories/membership-plan.repository';
import { GymEventPublisherPort } from '../ports/gym-event-publisher.port';
import { TestClock } from '../../domain/shared/clock';
import { MembershipPlan } from '../../domain/plan/membership-plan.aggregate';
import { PlanId } from '../../domain/plan/plan-id.vo';
import { PlanCode } from '../../domain/plan/plan-code.vo';
import { PlanDuration } from '../../domain/plan/plan-duration.vo';
import { PlanPrice } from '../../domain/plan/plan-price.vo';
import { PlanStatus } from '../../domain/plan/plan-status.enum';

describe('Phase 5.7-A: Membership Plan Application Handlers Spec', () => {
  let planRepo: jest.Mocked<MembershipPlanRepository>;
  let eventPublisher: jest.Mocked<GymEventPublisherPort>;
  let clock: TestClock;

  const baseTime = new Date('2026-08-22T10:00:00.000Z');

  const createMockPlan = (id = 'plan_test_01', status = PlanStatus.DRAFT): MembershipPlan => {
    return MembershipPlan.reconstitute({
      id: PlanId.create(id),
      code: PlanCode.create('STD_MONTHLY_2026'),
      name: 'Standard Monthly Plan',
      description: 'Full facility access',
      duration: PlanDuration.ofDays(30),
      price: PlanPrice.create(4999, 'USD'),
      status,
      version: 1,
      createdAt: baseTime,
      updatedAt: baseTime,
    });
  };

  beforeEach(() => {
    clock = new TestClock(baseTime);

    planRepo = {
      save: jest.fn(),
      findById: jest.fn(),
      findByCode: jest.fn(),
      findActive: jest.fn(),
      findAll: jest.fn(),
    };

    eventPublisher = {
      publish: jest.fn(),
    };
  });

  describe('1. CreateMembershipPlanHandler', () => {
    it('creates a draft plan and saves it to repository', async () => {
      planRepo.findByCode.mockResolvedValue(null);

      const handler = new CreateMembershipPlanHandler(planRepo, clock, eventPublisher);
      const command = new CreateMembershipPlanCommand({
        code: 'VIP_ANNUAL_2026',
        name: 'VIP Annual All Access',
        description: 'Unlimited access + personal trainer',
        durationInDays: 365,
        priceAmount: 99900,
        priceCurrency: 'USD',
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().code).toBe('VIP_ANNUAL_2026');
      expect(result.getValue().status).toBe(PlanStatus.DRAFT);
      expect(planRepo.save).toHaveBeenCalledTimes(1);
      expect(eventPublisher.publish).toHaveBeenCalledTimes(1);
    });

    it('fails when plan code already exists', async () => {
      planRepo.findByCode.mockResolvedValue(createMockPlan());

      const handler = new CreateMembershipPlanHandler(planRepo, clock, eventPublisher);
      const command = new CreateMembershipPlanCommand({
        code: 'STD_MONTHLY_2026',
        name: 'Duplicate Plan Code',
        durationInDays: 30,
        priceAmount: 5000,
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toContain(
        "Membership plan with code 'STD_MONTHLY_2026' already exists.",
      );
    });
  });

  describe('2. UpdateMembershipPlanPricingHandler', () => {
    it('updates plan pricing and saves changes', async () => {
      const plan = createMockPlan();
      planRepo.findById.mockResolvedValue(plan);

      const handler = new UpdateMembershipPlanPricingHandler(planRepo, clock, eventPublisher);
      const command = new UpdateMembershipPlanPricingCommand({
        planId: 'plan_test_01',
        newPriceAmount: 5999,
        currency: 'USD',
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().priceAmount).toBe(5999);
      expect(planRepo.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('3. PublishMembershipPlanHandler', () => {
    it('publishes a draft plan to ACTIVE status', async () => {
      const plan = createMockPlan('plan_test_01', PlanStatus.DRAFT);
      planRepo.findById.mockResolvedValue(plan);

      const handler = new PublishMembershipPlanHandler(planRepo, clock, eventPublisher);
      const command = new PublishMembershipPlanCommand({ planId: 'plan_test_01' });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().status).toBe(PlanStatus.ACTIVE);
      expect(planRepo.save).toHaveBeenCalledTimes(1);
      expect(eventPublisher.publish).toHaveBeenCalledTimes(1);
    });
  });

  describe('4. ArchiveMembershipPlanHandler', () => {
    it('archives an active plan', async () => {
      const plan = createMockPlan('plan_test_01', PlanStatus.ACTIVE);
      planRepo.findById.mockResolvedValue(plan);

      const handler = new ArchiveMembershipPlanHandler(planRepo, clock, eventPublisher);
      const command = new ArchiveMembershipPlanCommand({ planId: 'plan_test_01' });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().status).toBe(PlanStatus.ARCHIVED);
      expect(planRepo.save).toHaveBeenCalledTimes(1);
      expect(eventPublisher.publish).toHaveBeenCalledTimes(1);
    });
  });
});
