import { CreateMembershipPlanHandler } from './handlers/create-membership-plan.handler';
import { UpdateMembershipPlanPricingHandler } from './handlers/update-membership-plan-pricing.handler';
import { PublishMembershipPlanHandler } from './handlers/publish-membership-plan.handler';
import { ArchiveMembershipPlanHandler } from './handlers/archive-membership-plan.handler';
import { GetMembershipPlanByIdHandler } from './queries/get-membership-plan-by-id.handler';
import { ListMembershipPlansHandler } from './queries/list-membership-plans.handler';
import { CreateMembershipHandler } from './handlers/create-membership.handler';
import { CreateMembershipPlanCommand } from './commands/create-membership-plan.command';
import { UpdateMembershipPlanPricingCommand } from './commands/update-membership-plan-pricing.command';
import { PublishMembershipPlanCommand } from './commands/publish-membership-plan.command';
import { ArchiveMembershipPlanCommand } from './commands/archive-membership-plan.command';
import { GetMembershipPlanByIdQuery } from './queries/get-membership-plan-by-id.query';
import { ListMembershipPlansQuery } from './queries/list-membership-plans.query';
import { CreateMembershipCommand } from './commands/create-membership.command';
import { MembershipPlanRepository } from '../domain/repositories/membership-plan.repository';
import { MembershipRepository } from '../domain/repositories/membership.repository';
import { ClientLookupPort } from './ports/client-lookup.port';
import { GymEventPublisherPort } from './ports/gym-event-publisher.port';
import { TestClock } from '../domain/shared/clock';
import { MembershipPlan } from '../domain/plan/membership-plan.aggregate';
import { PlanId } from '../domain/plan/plan-id.vo';
import { PlanCode } from '../domain/plan/plan-code.vo';
import { PlanDuration } from '../domain/plan/plan-duration.vo';
import { PlanPrice } from '../domain/plan/plan-price.vo';
import { PlanStatus } from '../domain/plan/plan-status.enum';
import { VisitQuota } from '../domain/plan/visit-quota.vo';
import { Membership } from '../domain/membership/membership.aggregate';

describe('Phase 5.7-C: Comprehensive Membership Plan Application Use Cases Spec', () => {
  let planRepo: jest.Mocked<MembershipPlanRepository>;
  let membershipRepo: jest.Mocked<MembershipRepository>;
  let clientLookup: jest.Mocked<ClientLookupPort>;
  let eventPublisher: jest.Mocked<GymEventPublisherPort>;
  let clock: TestClock;

  const t0 = new Date('2026-08-01T00:00:00.000Z');

  const createPlanAggregate = (
    id = 'plan_std_01',
    code = 'STD_MONTHLY',
    status = PlanStatus.DRAFT,
    durationDays = 30,
    priceAmount = 4999,
  ): MembershipPlan => {
    return MembershipPlan.reconstitute({
      id: PlanId.create(id),
      code: PlanCode.create(code),
      name: 'Standard Monthly Plan',
      description: 'Standard facility access',
      duration: PlanDuration.ofDays(durationDays),
      price: PlanPrice.create(priceAmount, 'USD'),
      visitQuota: VisitQuota.of(30),
      status,
      version: 1,
      createdAt: t0,
      updatedAt: t0,
    });
  };

  beforeEach(() => {
    clock = new TestClock(t0);

    planRepo = {
      save: jest.fn(),
      findById: jest.fn(),
      findByCode: jest.fn(),
      findActive: jest.fn(),
      findAll: jest.fn(),
    } as unknown as jest.Mocked<MembershipPlanRepository>;

    membershipRepo = {
      save: jest.fn(),
      findById: jest.fn(),
      findByClientId: jest.fn().mockResolvedValue([]),
      findExpiringCandidates: jest.fn(),
      findExpiringWithinHorizon: jest.fn(),
      findByTrainerId: jest.fn(),
      findAll: jest.fn(),
    };

    clientLookup = {
      validateClientExists: jest.fn().mockResolvedValue(true),
    };

    eventPublisher = {
      publish: jest.fn(),
    };
  });

  // =========================================================================
  // 1. Plan Creation & Invariant Validation
  // =========================================================================
  describe('1. Plan Creation & Invariant Validation', () => {
    it('creates a draft plan with valid commercial attributes', async () => {
      planRepo.findByCode.mockResolvedValue(null);

      const handler = new CreateMembershipPlanHandler(planRepo, clock, eventPublisher);
      const command = new CreateMembershipPlanCommand({
        code: 'ANNUAL_VIP_2026',
        name: 'VIP Annual All-Access',
        description: '365 days unlimited gym + pool access',
        durationInDays: 365,
        priceAmount: 89900,
        priceCurrency: 'USD',
        visitQuota: 365,
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.code).toBe('ANNUAL_VIP_2026');
      expect(dto.durationInDays).toBe(365);
      expect(dto.priceAmount).toBe(89900);
      expect(dto.priceCurrency).toBe('USD');
      expect(dto.status).toBe(PlanStatus.DRAFT);
      expect(planRepo.save).toHaveBeenCalledTimes(1);
      expect(eventPublisher.publish).toHaveBeenCalledTimes(1);
    });

    it('rejects plan creation with duplicate code', async () => {
      planRepo.findByCode.mockResolvedValue(createPlanAggregate());

      const handler = new CreateMembershipPlanHandler(planRepo, clock, eventPublisher);
      const command = new CreateMembershipPlanCommand({
        code: 'STD_MONTHLY',
        name: 'Duplicate Plan',
        durationInDays: 30,
        priceAmount: 5000,
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toContain(
        "Membership plan with code 'STD_MONTHLY' already exists.",
      );
    });

    it('rejects plan creation with invalid duration (<= 0 days)', async () => {
      planRepo.findByCode.mockResolvedValue(null);

      const handler = new CreateMembershipPlanHandler(planRepo, clock, eventPublisher);
      const command = new CreateMembershipPlanCommand({
        code: 'INVALID_DUR',
        name: 'Zero Days Plan',
        durationInDays: 0,
        priceAmount: 5000,
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toContain('duration must be a positive integer');
    });

    it('rejects plan creation with negative price', async () => {
      planRepo.findByCode.mockResolvedValue(null);

      const handler = new CreateMembershipPlanHandler(planRepo, clock, eventPublisher);
      const command = new CreateMembershipPlanCommand({
        code: 'NEGATIVE_PRICE',
        name: 'Negative Price Plan',
        durationInDays: 30,
        priceAmount: -100,
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toContain('non-negative number');
    });
  });

  // =========================================================================
  // 2. Lifecycle State Transitions (Publish / Archive)
  // =========================================================================
  describe('2. Lifecycle State Transitions', () => {
    it('publishes a DRAFT plan to ACTIVE status and emits MembershipPlanPublishedEvent', async () => {
      const draftPlan = createPlanAggregate('plan_001', 'STD_MONTHLY', PlanStatus.DRAFT);
      planRepo.findById.mockResolvedValue(draftPlan);

      const handler = new PublishMembershipPlanHandler(planRepo, clock, eventPublisher);
      const result = await handler.execute(
        new PublishMembershipPlanCommand({ planId: 'plan_001' }),
      );

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().status).toBe(PlanStatus.ACTIVE);
      expect(planRepo.save).toHaveBeenCalledTimes(1);
      expect(eventPublisher.publish).toHaveBeenCalledTimes(1);
    });

    it('archives an ACTIVE plan and emits MembershipPlanArchivedEvent', async () => {
      const activePlan = createPlanAggregate('plan_001', 'STD_MONTHLY', PlanStatus.ACTIVE);
      planRepo.findById.mockResolvedValue(activePlan);

      const handler = new ArchiveMembershipPlanHandler(planRepo, clock, eventPublisher);
      const result = await handler.execute(
        new ArchiveMembershipPlanCommand({ planId: 'plan_001' }),
      );

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().status).toBe(PlanStatus.ARCHIVED);
      expect(planRepo.save).toHaveBeenCalledTimes(1);
      expect(eventPublisher.publish).toHaveBeenCalledTimes(1);
    });

    it('rejects publishing an ARCHIVED plan', async () => {
      const archivedPlan = createPlanAggregate('plan_001', 'STD_MONTHLY', PlanStatus.ARCHIVED);
      planRepo.findById.mockResolvedValue(archivedPlan);

      const handler = new PublishMembershipPlanHandler(planRepo, clock, eventPublisher);
      const result = await handler.execute(
        new PublishMembershipPlanCommand({ planId: 'plan_001' }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toContain('Cannot publish an archived plan');
    });
  });

  // =========================================================================
  // 3. Price Changes & Historical Integrity
  // =========================================================================
  describe('3. Price Changes & Historical Integrity', () => {
    it('updates pricing on an ACTIVE plan and records price changed event', async () => {
      const activePlan = createPlanAggregate(
        'plan_001',
        'STD_MONTHLY',
        PlanStatus.ACTIVE,
        30,
        4999,
      );
      planRepo.findById.mockResolvedValue(activePlan);

      const handler = new UpdateMembershipPlanPricingHandler(planRepo, clock, eventPublisher);
      const result = await handler.execute(
        new UpdateMembershipPlanPricingCommand({
          planId: 'plan_001',
          newPriceAmount: 5999,
          currency: 'USD',
        }),
      );

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().priceAmount).toBe(5999);
      expect(planRepo.save).toHaveBeenCalledTimes(1);
      expect(eventPublisher.publish).toHaveBeenCalledTimes(1);
    });

    it('rejects price update on an ARCHIVED plan', async () => {
      const archivedPlan = createPlanAggregate('plan_001', 'STD_MONTHLY', PlanStatus.ARCHIVED);
      planRepo.findById.mockResolvedValue(archivedPlan);

      const handler = new UpdateMembershipPlanPricingHandler(planRepo, clock, eventPublisher);
      const result = await handler.execute(
        new UpdateMembershipPlanPricingCommand({
          planId: 'plan_001',
          newPriceAmount: 5999,
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toContain('Cannot update pricing on an archived plan');
    });

    it('historical integrity: price changes do NOT mutate existing membership agreements', async () => {
      // 1. Initial plan at $49.99
      const plan = createPlanAggregate('plan_001', 'STD_MONTHLY', PlanStatus.ACTIVE, 30, 4999);
      planRepo.findById.mockResolvedValue(plan);

      // 2. Create Membership #1 under original price
      let savedMembership: Membership | null = null;
      membershipRepo.save.mockImplementation(async (m) => {
        savedMembership = m;
      });

      const createMemHandler = new CreateMembershipHandler(
        membershipRepo,
        planRepo,
        clientLookup,
        clock,
        eventPublisher,
      );

      const createRes = await createMemHandler.execute(
        new CreateMembershipCommand({
          clientId: 'client_001',
          planId: 'plan_001',
          startDate: '2026-08-01',
        }),
      );

      expect(createRes.isSuccess).toBe(true);
      const memDTO1 = createRes.getValue();
      expect(memDTO1.planId).toBe('plan_001');
      expect(memDTO1.period.durationDays).toBe(30);

      // 3. Update Plan price to $69.99
      const updatePriceHandler = new UpdateMembershipPlanPricingHandler(
        planRepo,
        clock,
        eventPublisher,
      );
      await updatePriceHandler.execute(
        new UpdateMembershipPlanPricingCommand({
          planId: 'plan_001',
          newPriceAmount: 6999,
        }),
      );

      // 4. Verify existing membership aggregate remained untouched and structurally unchanged
      expect(savedMembership).not.toBeNull();
      expect(savedMembership!.planId).toBe('plan_001');
      expect(savedMembership!.period.durationDays).toBe(30);
      expect(savedMembership!.period.startDate.toISOString()).toBe('2026-08-01T00:00:00.000Z');
      expect(savedMembership!.period.endDate.toISOString()).toBe('2026-08-31T00:00:00.000Z');
    });
  });

  // =========================================================================
  // 4. Queries (Filtering, Search, Sorting, Pagination)
  // =========================================================================
  describe('4. Queries (Filtering, Search, Sorting, Pagination)', () => {
    it('ListMembershipPlansHandler filters by search query matching name, code, or description', async () => {
      const p1 = createPlanAggregate('plan_01', 'STD_MONTHLY', PlanStatus.ACTIVE);
      const p2 = createPlanAggregate('plan_02', 'VIP_ANNUAL', PlanStatus.ACTIVE);
      const p3 = createPlanAggregate('plan_03', 'STUDENT_PASS', PlanStatus.DRAFT);
      (planRepo.findAll as jest.Mock).mockResolvedValue([p1, p2, p3]);

      const handler = new ListMembershipPlansHandler(planRepo);
      const result = await handler.execute(
        new ListMembershipPlansQuery({
          search: 'VIP',
          page: 1,
          limit: 10,
        }),
      );

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.total).toBe(1);
      expect(dto.items[0]!.code).toBe('VIP_ANNUAL');
    });

    it('ListMembershipPlansHandler enforces pagination and deterministic sorting (ACTIVE first, then createdAt DESC, id ASC)', async () => {
      const p1 = createPlanAggregate('plan_01', 'CODE_A', PlanStatus.DRAFT);
      const p2 = createPlanAggregate('plan_02', 'CODE_B', PlanStatus.ACTIVE);
      const p3 = createPlanAggregate('plan_03', 'CODE_C', PlanStatus.ACTIVE);
      (planRepo.findAll as jest.Mock).mockResolvedValue([p1, p2, p3]);

      const handler = new ListMembershipPlansHandler(planRepo);
      const result = await handler.execute(new ListMembershipPlansQuery({ page: 1, limit: 2 }));

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.total).toBe(3);
      expect(dto.items.length).toBe(2);
      expect(dto.items[0]!.status).toBe(PlanStatus.ACTIVE);
      expect(dto.items[1]!.status).toBe(PlanStatus.ACTIVE);
      expect(dto.hasNextPage).toBe(true);
    });

    it('GetMembershipPlanByIdHandler returns detailed plan DTO when found', async () => {
      const plan = createPlanAggregate('plan_001', 'STD_MONTHLY', PlanStatus.ACTIVE);
      planRepo.findById.mockResolvedValue(plan);

      const handler = new GetMembershipPlanByIdHandler(planRepo);
      const result = await handler.execute(new GetMembershipPlanByIdQuery({ planId: 'plan_001' }));

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().id).toBe('plan_001');
      expect(result.getValue().code).toBe('STD_MONTHLY');
    });
  });
});
