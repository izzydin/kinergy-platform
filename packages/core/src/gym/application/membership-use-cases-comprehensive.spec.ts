import { CreateMembershipHandler } from './handlers/create-membership.handler';
import { RenewMembershipHandler } from './handlers/renew-membership.handler';
import { FreezeMembershipHandler } from './handlers/freeze-membership.handler';
import { UnfreezeMembershipHandler } from './handlers/unfreeze-membership.handler';
import { CancelMembershipHandler } from './handlers/cancel-membership.handler';
import { ListMembershipsHandler } from './queries/list-memberships.handler';
import { ListExpiredMembershipsHandler } from './queries/list-expired-memberships.handler';
import { CreateMembershipCommand } from './commands/create-membership.command';
import { RenewMembershipCommand } from './commands/renew-membership.command';
import { FreezeMembershipCommand } from './commands/freeze-membership.command';
import { UnfreezeMembershipCommand } from './commands/unfreeze-membership.command';
import { CancelMembershipCommand } from './commands/cancel-membership.command';
import { ListMembershipsQuery } from './queries/list-memberships.query';
import { ListExpiredMembershipsQuery } from './queries/list-expired-memberships.query';
import { MembershipRepository } from '../domain/repositories/membership.repository';
import { MembershipPlanRepository } from '../domain/repositories/membership-plan.repository';
import { ClientLookupPort } from './ports/client-lookup.port';
import { GymEventPublisherPort } from './ports/gym-event-publisher.port';
import { TestClock } from '../domain/shared/clock';
import { Membership } from '../domain/membership/membership.aggregate';
import { MembershipPeriod } from '../domain/membership/membership-period.vo';
import { MembershipStatus } from '../domain/membership/membership-status.enum';
import { MembershipId } from '../domain/membership/membership-id.vo';
import { MembershipPlan } from '../domain/plan/membership-plan.aggregate';
import { PlanId } from '../domain/plan/plan-id.vo';
import { PlanCode } from '../domain/plan/plan-code.vo';
import { PlanDuration } from '../domain/plan/plan-duration.vo';
import { PlanPrice } from '../domain/plan/plan-price.vo';
import { PlanStatus } from '../domain/plan/plan-status.enum';

describe('Phase 5.7-B: Comprehensive Membership Application Use Cases Spec', () => {
  let membershipRepo: jest.Mocked<MembershipRepository>;
  let planRepo: jest.Mocked<MembershipPlanRepository>;
  let clientLookup: jest.Mocked<ClientLookupPort>;
  let eventPublisher: jest.Mocked<GymEventPublisherPort>;
  let clock: TestClock;

  const t0 = new Date('2026-08-01T00:00:00.000Z');

  const createActivePlan = (id = 'plan_std_01', durationDays = 30): MembershipPlan => {
    return MembershipPlan.reconstitute({
      id: PlanId.create(id),
      code: PlanCode.create(`CODE_${id}`),
      name: 'Standard Monthly',
      duration: PlanDuration.ofDays(durationDays),
      price: PlanPrice.create(5000, 'USD'),
      status: PlanStatus.ACTIVE,
      version: 1,
      createdAt: t0,
      updatedAt: t0,
    });
  };

  const createDraftPlan = (id = 'plan_draft_01'): MembershipPlan => {
    return MembershipPlan.reconstitute({
      id: PlanId.create(id),
      code: PlanCode.create(`CODE_${id}`),
      name: 'Draft Plan',
      duration: PlanDuration.ofDays(30),
      price: PlanPrice.create(5000, 'USD'),
      status: PlanStatus.DRAFT,
      version: 1,
      createdAt: t0,
      updatedAt: t0,
    });
  };

  const createMembership = (
    id: string,
    clientId: string,
    status = MembershipStatus.ACTIVE,
    startDate = new Date('2026-08-01T00:00:00.000Z'),
    endDate = new Date('2026-08-31T00:00:00.000Z'),
    planId = 'plan_std_01',
  ): Membership => {
    return Membership.reconstitute({
      id: MembershipId.create(id),
      clientId,
      planId,
      period: MembershipPeriod.create(startDate, endDate),
      status,
      version: 1,
      createdAt: startDate,
      updatedAt: startDate,
    });
  };

  beforeEach(() => {
    clock = new TestClock(t0);

    membershipRepo = {
      save: jest.fn(),
      findById: jest.fn(),
      findByClientId: jest.fn().mockResolvedValue([]),
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
    };

    clientLookup = {
      validateClientExists: jest.fn().mockResolvedValue(true),
    };

    eventPublisher = {
      publish: jest.fn(),
    };
  });

  // =========================================================================
  // 1. Creation Use Cases
  // =========================================================================
  describe('1. Membership Creation Use Cases', () => {
    it('creates an active membership when client and plan are valid', async () => {
      planRepo.findById.mockResolvedValue(createActivePlan());
      membershipRepo.findByClientId.mockResolvedValue([]);

      const handler = new CreateMembershipHandler(
        membershipRepo,
        planRepo,
        clientLookup,
        clock,
        eventPublisher,
      );

      const result = await handler.execute(
        new CreateMembershipCommand({
          clientId: 'client_001',
          planId: 'plan_std_01',
          startDate: '2026-08-01',
        }),
      );

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().status).toBe(MembershipStatus.ACTIVE);
      expect(result.getValue().period.durationDays).toBe(30);
      expect(membershipRepo.save).toHaveBeenCalledTimes(1);
      expect(eventPublisher.publish).toHaveBeenCalledTimes(1);
    });

    it('rejects membership creation if client does not exist in Client context', async () => {
      clientLookup.validateClientExists.mockResolvedValue(false);

      const handler = new CreateMembershipHandler(
        membershipRepo,
        planRepo,
        clientLookup,
        clock,
        eventPublisher,
      );

      const result = await handler.execute(
        new CreateMembershipCommand({
          clientId: 'client_nonexistent',
          planId: 'plan_std_01',
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toContain('does not exist');
    });

    it('rejects membership creation if plan is not available for purchase (DRAFT/ARCHIVED)', async () => {
      planRepo.findById.mockResolvedValue(createDraftPlan());

      const handler = new CreateMembershipHandler(
        membershipRepo,
        planRepo,
        clientLookup,
        clock,
        eventPublisher,
      );

      const result = await handler.execute(
        new CreateMembershipCommand({
          clientId: 'client_001',
          planId: 'plan_draft_01',
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toContain('is not active');
    });

    it('rejects creation when new period overlaps an existing active membership', async () => {
      planRepo.findById.mockResolvedValue(createActivePlan());
      const existing = createMembership(
        'mem_existing',
        'client_001',
        MembershipStatus.ACTIVE,
        new Date('2026-08-01T00:00:00.000Z'),
        new Date('2026-08-31T00:00:00.000Z'),
      );
      membershipRepo.findByClientId.mockResolvedValue([existing]);

      const handler = new CreateMembershipHandler(
        membershipRepo,
        planRepo,
        clientLookup,
        clock,
        eventPublisher,
      );

      const result = await handler.execute(
        new CreateMembershipCommand({
          clientId: 'client_001',
          planId: 'plan_std_01',
          startDate: '2026-08-15',
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toContain('overlaps with existing');
    });
  });

  // =========================================================================
  // 2. Renewal Use Cases (ADR-0061 Semantics)
  // =========================================================================
  describe('2. Membership Renewal Use Cases', () => {
    it('early renewal: extends period gaplessly from existing endDate, preserving 100% unused time', async () => {
      // Evaluation at 2026-08-15 (16 days before expiration on 2026-08-31)
      clock.setTime(new Date('2026-08-15T00:00:00.000Z'));
      const activeMem = createMembership(
        'mem_001',
        'client_001',
        MembershipStatus.ACTIVE,
        new Date('2026-08-01T00:00:00.000Z'),
        new Date('2026-08-31T00:00:00.000Z'),
      );
      membershipRepo.findById.mockResolvedValue(activeMem);
      planRepo.findById.mockResolvedValue(createActivePlan('plan_std_01', 30));

      const handler = new RenewMembershipHandler(membershipRepo, planRepo, clock, eventPublisher);

      const result = await handler.execute(
        new RenewMembershipCommand({
          membershipId: 'mem_001',
        }),
      );

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      // Period should be 30 + 30 = 60 days, starting at 2026-08-01 and ending on 2026-09-30
      expect(dto.period.durationDays).toBe(60);
      expect(dto.period.startDate).toBe('2026-08-01T00:00:00.000Z');
      expect(dto.period.endDate).toBe('2026-09-30T00:00:00.000Z');
      expect(membershipRepo.save).toHaveBeenCalledTimes(1);
      expect(eventPublisher.publish).toHaveBeenCalledTimes(1);
    });

    it('lapsed renewal: reactivates an expired membership with a fresh period starting at renewal date', async () => {
      // Evaluation at 2026-09-10 (10 days after 2026-08-31 expiration)
      clock.setTime(new Date('2026-09-10T10:00:00.000Z'));
      const expiredMem = createMembership(
        'mem_001',
        'client_001',
        MembershipStatus.EXPIRED,
        new Date('2026-08-01T00:00:00.000Z'),
        new Date('2026-08-31T00:00:00.000Z'),
      );
      membershipRepo.findById.mockResolvedValue(expiredMem);
      planRepo.findById.mockResolvedValue(createActivePlan('plan_std_01', 30));

      const handler = new RenewMembershipHandler(membershipRepo, planRepo, clock, eventPublisher);

      const result = await handler.execute(
        new RenewMembershipCommand({
          membershipId: 'mem_001',
        }),
      );

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.status).toBe(MembershipStatus.ACTIVE);
      expect(dto.period.durationDays).toBe(30);
      expect(new Date(dto.period.startDate).getTime()).toBe(
        new Date('2026-09-10T10:00:00.000Z').getTime(),
      );
    });

    it('rejects renewal from invalid lifecycle status (e.g. CANCELLED)', async () => {
      const cancelledMem = createMembership('mem_001', 'client_001', MembershipStatus.CANCELLED);
      membershipRepo.findById.mockResolvedValue(cancelledMem);
      planRepo.findById.mockResolvedValue(createActivePlan());

      const handler = new RenewMembershipHandler(membershipRepo, planRepo, clock, eventPublisher);

      const result = await handler.execute(new RenewMembershipCommand({ membershipId: 'mem_001' }));

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toContain('Only ACTIVE or EXPIRED memberships can be renewed');
    });
  });

  // =========================================================================
  // 3. Lifecycle Mutations
  // =========================================================================
  describe('3. Membership Lifecycle Mutations', () => {
    it('freeze then unfreeze extends membership period by exact freeze duration', async () => {
      const activeMem = createMembership(
        'mem_001',
        'client_001',
        MembershipStatus.ACTIVE,
        new Date('2026-08-01T00:00:00.000Z'),
        new Date('2026-08-31T00:00:00.000Z'),
      );
      membershipRepo.findById.mockResolvedValue(activeMem);

      const freezeHandler = new FreezeMembershipHandler(membershipRepo, clock, eventPublisher);
      const freezeRes = await freezeHandler.execute(
        new FreezeMembershipCommand({
          membershipId: 'mem_001',
          startDate: new Date('2026-08-10T00:00:00.000Z'),
          endDate: new Date('2026-08-20T00:00:00.000Z'), // 10 days freeze
          reason: 'Vacation',
        }),
      );

      expect(freezeRes.isSuccess).toBe(true);
      expect(freezeRes.getValue().status).toBe(MembershipStatus.FROZEN);

      const unfreezeHandler = new UnfreezeMembershipHandler(membershipRepo, clock, eventPublisher);
      const unfreezeRes = await unfreezeHandler.execute(
        new UnfreezeMembershipCommand({ membershipId: 'mem_001' }),
      );

      expect(unfreezeRes.isSuccess).toBe(true);
      expect(unfreezeRes.getValue().status).toBe(MembershipStatus.ACTIVE);
      // Original 30 days + 10 freeze days = 40 days
      expect(unfreezeRes.getValue().period.durationDays).toBe(40);
    });

    it('cancel membership sets CANCELLED status and persists reason', async () => {
      const activeMem = createMembership('mem_001', 'client_001');
      membershipRepo.findById.mockResolvedValue(activeMem);

      const cancelHandler = new CancelMembershipHandler(membershipRepo, clock, eventPublisher);
      const result = await cancelHandler.execute(
        new CancelMembershipCommand({
          membershipId: 'mem_001',
          reason: 'Client relocated',
        }),
      );

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().status).toBe(MembershipStatus.CANCELLED);
    });
  });

  // =========================================================================
  // 4. Query Use Cases (Pagination, Filtering, Sorting)
  // =========================================================================
  describe('4. Membership Query Use Cases', () => {
    it('ListMembershipsHandler filters by status and applies deterministic pagination', async () => {
      const m1 = createMembership(
        'mem_001',
        'client_001',
        MembershipStatus.ACTIVE,
        new Date('2026-08-01'),
      );
      const m2 = createMembership(
        'mem_002',
        'client_001',
        MembershipStatus.ACTIVE,
        new Date('2026-08-05'),
      );
      const m3 = createMembership(
        'mem_003',
        'client_001',
        MembershipStatus.EXPIRED,
        new Date('2026-07-01'),
      );
      membershipRepo.findAll.mockResolvedValue([m1, m2, m3]);

      const handler = new ListMembershipsHandler(membershipRepo);
      const result = await handler.execute(
        new ListMembershipsQuery({
          status: 'ACTIVE',
          page: 1,
          limit: 10,
        }),
      );

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.total).toBe(2);
      expect(dto.items.length).toBe(2);
      // Deterministic sort: newer startDate first
      expect(dto.items[0]!.id).toBe('mem_002');
      expect(dto.items[1]!.id).toBe('mem_001');
    });

    it('ListExpiredMembershipsHandler returns strictly expired memberships', async () => {
      const m1 = createMembership('mem_001', 'client_001', MembershipStatus.ACTIVE);
      const m2 = createMembership('mem_002', 'client_001', MembershipStatus.EXPIRED);
      membershipRepo.findAll.mockResolvedValue([m1, m2]);

      const handler = new ListExpiredMembershipsHandler(membershipRepo);
      const result = await handler.execute(new ListExpiredMembershipsQuery({ page: 1, limit: 10 }));

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.total).toBe(1);
      expect(dto.items[0]!.id).toBe('mem_002');
      expect(dto.items[0]!.status).toBe(MembershipStatus.EXPIRED);
    });
  });
});
