import { ActivateOrRenewMembershipHandler } from './application/handlers/activate-or-renew-membership.handler';
import { ResolveMembershipCommercialDetailsHandler } from './application/queries/resolve-membership-commercial-details.handler';
import { ResolveMembershipCommercialDetailsQuery } from './application/queries/resolve-membership-commercial-details.query';
import { InMemoryGymFulfillmentStore } from './application/ports/gym-fulfillment-store.port';
import { MembershipRepository } from './domain/repositories/membership.repository';
import { MembershipPlanRepository } from './domain/repositories/membership-plan.repository';
import { ClientLookupPort } from './application/ports/client-lookup.port';
import { GymEventPublisherPort } from './application/ports/gym-event-publisher.port';
import { TestClock } from './domain/shared/clock';
import { MembershipPlan } from './domain/plan/membership-plan.aggregate';
import { PlanId } from './domain/plan/plan-id.vo';
import { PlanCode } from './domain/plan/plan-code.vo';
import { PlanPrice } from './domain/plan/plan-price.vo';
import { PlanDuration } from './domain/plan/plan-duration.vo';
import { PlanStatus } from './domain/plan/plan-status.enum';
import { Membership } from './domain/membership/membership.aggregate';
import { MembershipId } from './domain/membership/membership-id.vo';
import { MembershipPeriod } from './domain/membership/membership-period.vo';
import { MembershipStatus } from './domain/membership/membership-status.enum';
import { FreezeWindow } from './domain/membership/freeze-window.vo';
import { MembershipOverlapPolicy } from './domain/policies/membership-overlap.policy';

describe('Gym-to-Sales Commercial Integration Test Suite (Milestone 7.19 / Prompt 7B)', () => {
  const baseTime = new Date('2026-07-01T00:00:00.000Z');
  let clock: TestClock;

  let membershipRepo: jest.Mocked<MembershipRepository>;
  let planRepo: jest.Mocked<MembershipPlanRepository>;
  let clientLookup: jest.Mocked<ClientLookupPort>;
  let eventPublisher: jest.Mocked<GymEventPublisherPort>;
  let fulfillmentStore: InMemoryGymFulfillmentStore;
  let overlapPolicy: MembershipOverlapPolicy;

  let activationHandler: ActivateOrRenewMembershipHandler;
  let commercialDetailsHandler: ResolveMembershipCommercialDetailsHandler;

  // Pre-configured commercial catalog plans
  let activePlanMonthly: MembershipPlan;
  let activePlanAnnual: MembershipPlan;
  let draftPlan: MembershipPlan;
  let archivedPlan: MembershipPlan;

  // In-memory backing stores for mock repositories
  let membershipsDb: Map<string, Membership>;
  let plansDb: Map<string, MembershipPlan>;

  beforeEach(() => {
    clock = new TestClock(baseTime);
    fulfillmentStore = new InMemoryGymFulfillmentStore();
    overlapPolicy = new MembershipOverlapPolicy();

    membershipsDb = new Map<string, Membership>();
    plansDb = new Map<string, MembershipPlan>();

    // 1. Setup Plans
    activePlanMonthly = MembershipPlan.create({
      id: PlanId.create('plan_monthly_30d'),
      code: PlanCode.create('STD_MONTHLY'),
      name: 'Standard Monthly Pass',
      duration: PlanDuration.ofDays(30),
      price: PlanPrice.create(60.0, 'USD'),
      status: PlanStatus.ACTIVE,
    });

    activePlanAnnual = MembershipPlan.create({
      id: PlanId.create('plan_annual_365d'),
      code: PlanCode.create('VIP_ANNUAL'),
      name: 'VIP Annual All-Access',
      duration: PlanDuration.ofDays(365),
      price: PlanPrice.create(650.5, 'USD'), // $650.50 -> 65050 cents
      status: PlanStatus.ACTIVE,
    });

    draftPlan = MembershipPlan.create({
      id: PlanId.create('plan_draft_promo'),
      code: PlanCode.create('SUMMER_PROMO'),
      name: 'Summer Staging Promo',
      duration: PlanDuration.ofDays(60),
      price: PlanPrice.create(45.0, 'USD'),
      status: PlanStatus.DRAFT,
    });

    archivedPlan = MembershipPlan.create({
      id: PlanId.create('plan_retired_2025'),
      code: PlanCode.create('RET_2025'),
      name: 'Retired 2025 Offering',
      duration: PlanDuration.ofDays(30),
      price: PlanPrice.create(50.0, 'USD'),
      status: PlanStatus.ACTIVE,
    });
    archivedPlan.archive(baseTime);

    plansDb.set(activePlanMonthly.id.value, activePlanMonthly);
    plansDb.set(activePlanAnnual.id.value, activePlanAnnual);
    plansDb.set(draftPlan.id.value, draftPlan);
    plansDb.set(archivedPlan.id.value, archivedPlan);

    // 2. Setup Repositories
    planRepo = {
      save: jest.fn().mockImplementation(async (plan: MembershipPlan) => {
        plansDb.set(plan.id.value, plan);
      }),
      findById: jest.fn().mockImplementation(async (id: string) => plansDb.get(id) ?? null),
      findByCode: jest.fn().mockImplementation(async (code: string) => {
        return Array.from(plansDb.values()).find((p) => p.code.value === code) ?? null;
      }),
      findActive: jest.fn().mockImplementation(async () => {
        return Array.from(plansDb.values()).filter((p) => p.status === PlanStatus.ACTIVE);
      }),
    };

    membershipRepo = {
      save: jest.fn().mockImplementation(async (membership: Membership) => {
        membershipsDb.set(membership.id.value, membership);
      }),
      findById: jest.fn().mockImplementation(async (id: string) => membershipsDb.get(id) ?? null),
      findByClientId: jest.fn().mockImplementation(async (clientId: string) => {
        return Array.from(membershipsDb.values()).filter((m) => m.clientId === clientId);
      }),
      findAll: jest.fn().mockImplementation(async () => Array.from(membershipsDb.values())),
      findExpiringCandidates: jest.fn().mockResolvedValue([]),
      findExpiringWithinHorizon: jest.fn().mockResolvedValue([]),
      findByTrainerId: jest.fn().mockResolvedValue([]),
    };

    clientLookup = {
      validateClientExists: jest.fn().mockResolvedValue(true),
    };

    eventPublisher = {
      publish: jest.fn().mockResolvedValue(undefined),
    };

    // 3. Handlers under test
    activationHandler = new ActivateOrRenewMembershipHandler(
      membershipRepo,
      planRepo,
      clientLookup,
      clock,
      eventPublisher,
      fulfillmentStore,
      overlapPolicy,
    );

    commercialDetailsHandler = new ResolveMembershipCommercialDetailsHandler(
      planRepo,
      membershipRepo,
      clientLookup,
      clock,
      overlapPolicy,
    );
  });

  // =========================================================================
  // 1. Authoritative Commercial Details & Price Resolution
  // =========================================================================
  describe('1. Authoritative Commercial Details & Price Resolution', () => {
    it('should resolve authoritative integer cents price and currency for an active plan purchase', async () => {
      const query = new ResolveMembershipCommercialDetailsQuery({
        sourceId: 'plan_annual_365d',
        clientId: 'client_pt_100',
      });

      const result = await commercialDetailsHandler.execute(query);
      expect(result.isSuccess).toBe(true);
      const details = result.getValue();

      expect(details.isRenewal).toBe(false);
      expect(details.isEligible).toBe(true);
      expect(details.planId).toBe('plan_annual_365d');
      expect(details.planCode).toBe('VIP_ANNUAL');
      expect(details.planName).toBe('VIP Annual All-Access');
      expect(details.durationDays).toBe(365);
      // $650.50 => exactly 65050 minor integer cents
      expect(details.unitPriceCents).toBe(65050);
      expect(details.currency).toBe('USD');
      expect(details.description).toBe('Gym Membership - VIP Annual All-Access');
    });

    it('should reject a DRAFT plan with isEligible: false and explicit reason', async () => {
      const query = new ResolveMembershipCommercialDetailsQuery({
        sourceId: 'plan_draft_promo',
        clientId: 'client_pt_100',
      });

      const result = await commercialDetailsHandler.execute(query);
      expect(result.isSuccess).toBe(true);
      const details = result.getValue();

      expect(details.isEligible).toBe(false);
      expect(details.eligibilityReason).toContain('status');
      expect(details.eligibilityReason).toContain('Only ACTIVE plans can be sold');
    });

    it('should reject an ARCHIVED plan from sale', async () => {
      const query = new ResolveMembershipCommercialDetailsQuery({
        sourceId: 'plan_retired_2025',
      });

      const result = await commercialDetailsHandler.execute(query);
      expect(result.isSuccess).toBe(true);
      const details = result.getValue();

      expect(details.isEligible).toBe(false);
      expect(details.eligibilityReason).toContain('ARCHIVED');
    });

    it('should resolve renewal commercial details when sourceId is an existing membership ID', async () => {
      // Seed existing membership
      const initialPeriod = MembershipPeriod.create(
        new Date('2026-07-01T00:00:00.000Z'),
        new Date('2026-07-31T00:00:00.000Z'),
      );
      const membership = Membership.create({
        id: MembershipId.create('mem_existing_01'),
        clientId: 'client_member_99',
        planId: 'plan_monthly_30d',
        period: initialPeriod,
        status: MembershipStatus.ACTIVE,
      });
      membershipsDb.set(membership.id.value, membership);

      const query = new ResolveMembershipCommercialDetailsQuery({
        sourceId: 'mem_existing_01',
        clientId: 'client_member_99',
      });

      const result = await commercialDetailsHandler.execute(query);
      expect(result.isSuccess).toBe(true);
      const details = result.getValue();

      expect(details.isRenewal).toBe(true);
      expect(details.isEligible).toBe(true);
      expect(details.membershipId).toBe('mem_existing_01');
      expect(details.planId).toBe('plan_monthly_30d');
      expect(details.unitPriceCents).toBe(6000); // $60.00 => 6000 cents
      expect(details.currency).toBe('USD');
      expect(details.description).toBe('Gym Membership Renewal - Standard Monthly Pass');
    });
  });

  // =========================================================================
  // 2. Eligible Purchase Workflow
  // =========================================================================
  describe('2. Eligible Purchase Fulfillment', () => {
    it('should fulfill an eligible new membership purchase, create aggregate, and record fulfillment', async () => {
      const result = await activationHandler.activateOrRenew({
        clientId: 'client_new_01',
        planId: 'plan_monthly_30d',
        paymentRef: 'sale_initial_purchase_101',
        customId: 'mem_created_01',
      });

      expect(result.isSuccess).toBe(true);
      expect(result.wasReplay).toBe(false);
      expect(result.action).toBe('PURCHASED');
      expect(result.membership).toBeDefined();

      const created = result.membership!;
      expect(created.id).toBe('mem_created_01');
      expect(created.clientId).toBe('client_new_01');
      expect(created.planId).toBe('plan_monthly_30d');
      expect(created.status).toBe(MembershipStatus.ACTIVE);
      expect(created.version).toBe(1);

      // Verify date math: 30 days from July 1 => July 31
      expect(created.period.startDate).toBe('2026-07-01T00:00:00.000Z');
      expect(created.period.endDate).toBe('2026-07-31T00:00:00.000Z');

      // Verify aggregate persisted
      expect(membershipRepo.save).toHaveBeenCalled();
      const savedInDb = membershipsDb.get('mem_created_01');
      expect(savedInDb).toBeDefined();
      expect(savedInDb!.isActive()).toBe(true);

      // Verify domain events published
      expect(eventPublisher.publish).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 3. Legitimate Renewal Workflow (On-Time & Lapsed)
  // =========================================================================
  describe('3. Legitimate Renewal Fulfillment', () => {
    it('should execute gapless on-time renewal preserving 100% of remaining days (ADR-0061)', async () => {
      // Member on June 1 -> July 15 renews on July 1 (14 days remaining)
      const initialPeriod = MembershipPeriod.create(
        new Date('2026-06-01T00:00:00.000Z'),
        new Date('2026-07-15T00:00:00.000Z'),
      );
      const membership = Membership.create({
        id: MembershipId.create('mem_ontime_01'),
        clientId: 'client_ontime_01',
        planId: 'plan_monthly_30d',
        period: initialPeriod,
        status: MembershipStatus.ACTIVE,
      });
      membershipsDb.set(membership.id.value, membership);

      const result = await activationHandler.activateOrRenew({
        clientId: 'client_ontime_01',
        planId: 'plan_monthly_30d',
        membershipId: 'mem_ontime_01',
        paymentRef: 'sale_ontime_renewal_201',
      });

      expect(result.isSuccess).toBe(true);
      expect(result.wasReplay).toBe(false);
      expect(result.action).toBe('RENEWED');

      const renewed = result.membership!;
      expect(renewed.id).toBe('mem_ontime_01');
      expect(renewed.version).toBe(2);
      // Start date remains June 1
      expect(renewed.period.startDate).toBe('2026-06-01T00:00:00.000Z');
      // End date extended gaplessly: July 15 + 30 days = August 14
      expect(renewed.period.endDate).toBe('2026-08-14T00:00:00.000Z');

      expect(eventPublisher.publish).toHaveBeenCalled();
    });

    it('should renew an EXPIRED membership establishing a fresh period from effective instant without backdating', async () => {
      // Membership expired on June 20; renewed on July 1
      const expiredPeriod = MembershipPeriod.create(
        new Date('2026-05-20T00:00:00.000Z'),
        new Date('2026-06-20T00:00:00.000Z'),
      );
      const membership = Membership.create({
        id: MembershipId.create('mem_lapsed_01'),
        clientId: 'client_lapsed_01',
        planId: 'plan_monthly_30d',
        period: expiredPeriod,
        status: MembershipStatus.ACTIVE,
      });
      membership.expire(clock); // Transitions to EXPIRED
      expect(membership.status).toBe(MembershipStatus.EXPIRED);
      membershipsDb.set(membership.id.value, membership);

      const result = await activationHandler.activateOrRenew({
        clientId: 'client_lapsed_01',
        planId: 'plan_monthly_30d',
        membershipId: 'mem_lapsed_01',
        paymentRef: 'sale_lapsed_renewal_301',
      });

      expect(result.isSuccess).toBe(true);
      expect(result.wasReplay).toBe(false);
      expect(result.action).toBe('RENEWED');

      const reactivated = result.membership!;
      expect(reactivated.status).toBe(MembershipStatus.ACTIVE);
      // New period begins from effective current time (July 1)
      expect(reactivated.period.startDate).toBe('2026-07-01T00:00:00.000Z');
      expect(reactivated.period.endDate).toBe('2026-07-31T00:00:00.000Z');
    });
  });

  // =========================================================================
  // 4. Retry of the Same Commercial Operation (Idempotency Replay)
  // =========================================================================
  describe('4. Retry of the Same Commercial Operation (Idempotency Replay)', () => {
    it('should deduplicate sequential retries with the same paymentRef without double-extending or emitting duplicate events', async () => {
      const initialPeriod = MembershipPeriod.create(
        new Date('2026-07-01T00:00:00.000Z'),
        new Date('2026-07-31T00:00:00.000Z'),
      );
      const membership = Membership.create({
        id: MembershipId.create('mem_idemp_01'),
        clientId: 'client_idemp_01',
        planId: 'plan_monthly_30d',
        period: initialPeriod,
        status: MembershipStatus.ACTIVE,
      });
      membershipsDb.set(membership.id.value, membership);

      // --- First Call (Initial Execution) ---
      const firstResult = await activationHandler.activateOrRenew({
        clientId: 'client_idemp_01',
        planId: 'plan_monthly_30d',
        membershipId: 'mem_idemp_01',
        paymentRef: 'sale_tx_401',
      });

      expect(firstResult.isSuccess).toBe(true);
      expect(firstResult.wasReplay).toBe(false);
      expect(firstResult.membership!.version).toBe(2);
      expect(firstResult.membership!.period.endDate).toBe('2026-08-30T00:00:00.000Z');
      expect(eventPublisher.publish).toHaveBeenCalledTimes(1);

      // --- Second Call (Network Retry with identical paymentRef) ---
      const secondResult = await activationHandler.activateOrRenew({
        clientId: 'client_idemp_01',
        planId: 'plan_monthly_30d',
        membershipId: 'mem_idemp_01',
        paymentRef: 'sale_tx_401',
      });

      expect(secondResult.isSuccess).toBe(true);
      expect(secondResult.wasReplay).toBe(true); // Recognized as idempotent replay!
      expect(secondResult.membership!.version).toBe(2); // Version DID NOT increment to 3
      // End date DID NOT extend by another 30 days
      expect(secondResult.membership!.period.endDate).toBe('2026-08-30T00:00:00.000Z');
      // No duplicate event published on replay
      expect(eventPublisher.publish).toHaveBeenCalledTimes(1);

      // --- Third Call (Third Retry) ---
      const thirdResult = await activationHandler.activateOrRenew({
        clientId: 'client_idemp_01',
        planId: 'plan_monthly_30d',
        membershipId: 'mem_idemp_01',
        paymentRef: 'sale_tx_401',
      });
      expect(thirdResult.wasReplay).toBe(true);
      expect(thirdResult.membership!.version).toBe(2);
      expect(eventPublisher.publish).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // 5. Verification that Idempotency Does Not Block a Valid Later Renewal
  // =========================================================================
  describe('5. Idempotency Does Not Block a Valid Later Renewal', () => {
    it('should allow legitimate subsequent renewal with a NEW paymentRef after a previous renewal was fulfilled', async () => {
      // 1. Initial Membership
      const initialPeriod = MembershipPeriod.create(
        new Date('2026-07-01T00:00:00.000Z'),
        new Date('2026-07-31T00:00:00.000Z'),
      );
      const membership = Membership.create({
        id: MembershipId.create('mem_multi_renewal_01'),
        clientId: 'client_multi_01',
        planId: 'plan_monthly_30d',
        period: initialPeriod,
        status: MembershipStatus.ACTIVE,
      });
      membershipsDb.set(membership.id.value, membership);

      // 2. Month 1 Renewal (PaymentRef: sale_month_1)
      const renewal1 = await activationHandler.activateOrRenew({
        clientId: 'client_multi_01',
        planId: 'plan_monthly_30d',
        membershipId: 'mem_multi_renewal_01',
        paymentRef: 'sale_month_1',
      });
      expect(renewal1.isSuccess).toBe(true);
      expect(renewal1.wasReplay).toBe(false);
      expect(renewal1.membership!.version).toBe(2);
      expect(renewal1.membership!.period.endDate).toBe('2026-08-30T00:00:00.000Z');

      // 3. Retry of Month 1 is deduplicated
      const replay1 = await activationHandler.activateOrRenew({
        clientId: 'client_multi_01',
        planId: 'plan_monthly_30d',
        membershipId: 'mem_multi_renewal_01',
        paymentRef: 'sale_month_1',
      });
      expect(replay1.wasReplay).toBe(true);

      // 4. Advance Time into August
      clock.advanceDays(35); // 35 days later (August 5)

      // 5. Month 2 Renewal (New PaymentRef: sale_month_2) -> MUST SUCCEED!
      const renewal2 = await activationHandler.activateOrRenew({
        clientId: 'client_multi_01',
        planId: 'plan_monthly_30d',
        membershipId: 'mem_multi_renewal_01',
        paymentRef: 'sale_month_2',
      });

      expect(renewal2.isSuccess).toBe(true);
      expect(renewal2.wasReplay).toBe(false);
      expect(renewal2.action).toBe('RENEWED');
      // Version increments to 3
      expect(renewal2.membership!.version).toBe(3);
      // Period extended from August 30 by 30 days => September 29
      expect(renewal2.membership!.period.endDate).toBe('2026-09-29T00:00:00.000Z');
      expect(eventPublisher.publish).toHaveBeenCalledTimes(2);

      // 6. Retry of Month 2 is also deduplicated
      const replay2 = await activationHandler.activateOrRenew({
        clientId: 'client_multi_01',
        planId: 'plan_monthly_30d',
        membershipId: 'mem_multi_renewal_01',
        paymentRef: 'sale_month_2',
      });
      expect(replay2.wasReplay).toBe(true);
      expect(replay2.membership!.version).toBe(3);
    });
  });

  // =========================================================================
  // 6. Missing / Ineligible Membership Preconditions
  // =========================================================================
  describe('6. Missing / Ineligible Membership Preconditions', () => {
    it('should reject renewal when membershipId is not found', async () => {
      const result = await activationHandler.activateOrRenew({
        clientId: 'client_any',
        planId: 'plan_monthly_30d',
        membershipId: 'mem_non_existent',
        paymentRef: 'sale_fail_01',
      });

      expect(result.isSuccess).toBe(false);
      expect(result.errorMessage).toContain("Membership with id 'mem_non_existent' not found");
    });

    it('should reject renewal for a CANCELLED membership', async () => {
      const membership = Membership.create({
        id: MembershipId.create('mem_cancelled_01'),
        clientId: 'client_canc_01',
        planId: 'plan_monthly_30d',
        period: MembershipPeriod.create(
          new Date('2026-07-01T00:00:00.000Z'),
          new Date('2026-07-31T00:00:00.000Z'),
        ),
        status: MembershipStatus.ACTIVE,
      });
      membership.cancel('Client requested voluntary cancellation');
      expect(membership.status).toBe(MembershipStatus.CANCELLED);
      membershipsDb.set(membership.id.value, membership);

      const result = await activationHandler.activateOrRenew({
        clientId: 'client_canc_01',
        planId: 'plan_monthly_30d',
        membershipId: 'mem_cancelled_01',
        paymentRef: 'sale_fail_02',
      });

      expect(result.isSuccess).toBe(false);
      expect(result.errorMessage).toContain('CANCELLED');
    });

    it('should reject renewal for a TERMINATED membership', async () => {
      const membership = Membership.create({
        id: MembershipId.create('mem_terminated_01'),
        clientId: 'client_term_01',
        planId: 'plan_monthly_30d',
        period: MembershipPeriod.create(
          new Date('2026-07-01T00:00:00.000Z'),
          new Date('2026-07-31T00:00:00.000Z'),
        ),
        status: MembershipStatus.ACTIVE,
      });
      membership.terminate('Involuntary termination for club rules violation');
      expect(membership.status).toBe(MembershipStatus.TERMINATED);
      membershipsDb.set(membership.id.value, membership);

      const result = await activationHandler.activateOrRenew({
        clientId: 'client_term_01',
        planId: 'plan_monthly_30d',
        membershipId: 'mem_terminated_01',
        paymentRef: 'sale_fail_03',
      });

      expect(result.isSuccess).toBe(false);
      expect(result.errorMessage).toContain('TERMINATED');
    });

    it('should reject renewal for a FROZEN membership directing caller to resume first', async () => {
      const membership = Membership.create({
        id: MembershipId.create('mem_frozen_01'),
        clientId: 'client_frz_01',
        planId: 'plan_monthly_30d',
        period: MembershipPeriod.create(
          new Date('2026-07-01T00:00:00.000Z'),
          new Date('2026-07-31T00:00:00.000Z'),
        ),
        status: MembershipStatus.ACTIVE,
      });
      membership.freeze(
        FreezeWindow.create(
          new Date('2026-07-05T00:00:00.000Z'),
          new Date('2026-07-20T00:00:00.000Z'),
          'Medical leave',
        ),
      );
      expect(membership.status).toBe(MembershipStatus.FROZEN);
      membershipsDb.set(membership.id.value, membership);

      const result = await activationHandler.activateOrRenew({
        clientId: 'client_frz_01',
        planId: 'plan_monthly_30d',
        membershipId: 'mem_frozen_01',
        paymentRef: 'sale_fail_04',
      });

      expect(result.isSuccess).toBe(false);
      expect(result.errorMessage).toContain('FROZEN');
      expect(result.errorMessage).toContain('must be resumed before renewal');
    });

    it('should reject renewal when client mismatch occurs', async () => {
      const membership = Membership.create({
        id: MembershipId.create('mem_owned_by_alice'),
        clientId: 'client_alice',
        planId: 'plan_monthly_30d',
        period: MembershipPeriod.create(
          new Date('2026-07-01T00:00:00.000Z'),
          new Date('2026-07-31T00:00:00.000Z'),
        ),
        status: MembershipStatus.ACTIVE,
      });
      membershipsDb.set(membership.id.value, membership);

      const result = await activationHandler.activateOrRenew({
        clientId: 'client_bob', // Impersonator / mismatch
        planId: 'plan_monthly_30d',
        membershipId: 'mem_owned_by_alice',
        paymentRef: 'sale_fail_05',
      });

      expect(result.isSuccess).toBe(false);
      expect(result.errorMessage).toContain('does not own membership');
    });
  });

  // =========================================================================
  // 7. General Validation Failures
  // =========================================================================
  describe('7. General Validation Failures', () => {
    it('should reject missing paymentRef', async () => {
      const result = await activationHandler.activateOrRenew({
        clientId: 'client_01',
        planId: 'plan_monthly_30d',
        paymentRef: '',
      });

      expect(result.isSuccess).toBe(false);
      expect(result.errorMessage).toContain('paymentRef');
    });

    it('should reject non-existent plan', async () => {
      const result = await activationHandler.activateOrRenew({
        clientId: 'client_01',
        planId: 'plan_missing_404',
        paymentRef: 'sale_009',
      });

      expect(result.isSuccess).toBe(false);
      expect(result.errorMessage).toContain('not found');
    });

    it('should reject when external client lookup returns false', async () => {
      clientLookup.validateClientExists.mockResolvedValueOnce(false);

      const result = await activationHandler.activateOrRenew({
        clientId: 'client_ghost_01',
        planId: 'plan_monthly_30d',
        paymentRef: 'sale_010',
      });

      expect(result.isSuccess).toBe(false);
      expect(result.errorMessage).toContain('does not exist or is not eligible');
    });

    it('should reject purchase creating interval overlap with an existing active membership', async () => {
      // Existing active membership covering July 1 -> July 31
      const existing = Membership.create({
        id: MembershipId.create('mem_overlap_01'),
        clientId: 'client_overlap_01',
        planId: 'plan_monthly_30d',
        period: MembershipPeriod.create(
          new Date('2026-07-01T00:00:00.000Z'),
          new Date('2026-07-31T00:00:00.000Z'),
        ),
        status: MembershipStatus.ACTIVE,
      });
      membershipsDb.set(existing.id.value, existing);

      // Attempt fresh purchase on a DIFFERENT plan that starts inside July
      const result = await activationHandler.activateOrRenew({
        clientId: 'client_overlap_01',
        planId: 'plan_annual_365d',
        paymentRef: 'sale_overlap_attempt',
        effectiveDate: new Date('2026-07-15T00:00:00.000Z'),
      });

      expect(result.isSuccess).toBe(false);
      expect(result.errorMessage).toContain('overlap');
    });
  });
});
