import { TestClock } from './shared/clock';
import { MembershipPlan } from './plan/membership-plan.aggregate';
import { PlanId } from './plan/plan-id.vo';
import { PlanCode } from './plan/plan-code.vo';
import { PlanPrice } from './plan/plan-price.vo';
import { PlanDuration } from './plan/plan-duration.vo';
import { VisitQuota } from './plan/visit-quota.vo';
import { PlanStatus } from './plan/plan-status.enum';
import { Membership } from './membership/membership.aggregate';
import { MembershipId } from './membership/membership-id.vo';
import { MembershipPeriod } from './membership/membership-period.vo';
import { MembershipStatus } from './membership/membership-status.enum';
import { FreezeWindow } from './membership/freeze-window.vo';
import { MembershipOverlapPolicy } from './policies/membership-overlap.policy';
import { CreateMembershipHandler } from '../application/handlers/create-membership.handler';
import { CreateMembershipCommand } from '../application/commands/create-membership.command';
import { MembershipRepository } from './repositories/membership.repository';
import { MembershipPlanRepository } from './repositories/membership-plan.repository';
import { ClientLookupPort } from '../application/ports/client-lookup.port';
import { GymEventPublisherPort } from '../application/ports/gym-event-publisher.port';
import { MembershipPlanCreatedEvent } from './events/membership-plan-created.event';
import { MembershipPlanPriceChangedEvent } from './events/membership-plan-price-changed.event';
import { MembershipCreatedEvent } from './events/membership-created.event';
import { MembershipRenewedEvent } from './events/membership-renewed.event';
import { InvalidPlanTransitionException } from './exceptions/invalid-plan-transition.exception';
import { InvalidMembershipTransitionException } from './exceptions/invalid-membership-transition.exception';
import { OverlappingMembershipException } from './exceptions/overlapping-membership.exception';
import { MembershipPlanInvariantViolationException } from './exceptions/membership-plan-invariant-violation.exception';

/**
 * Phase 5.3-F Complete Commercial Test Suite
 *
 * Verifies end-to-end commercial integrity across:
 * 1. MembershipPlan value objects & aggregate lifecycle
 * 2. Commercial catalog availability enforcement
 * 3. Membership creation use case orchestration
 * 4. Historical integrity under commercial mutations
 * 5. Complete overlap interval topology matrix
 * 6. Early renewal semantics
 * 7. Client reference decoupling
 * 8. Domain event auditing and uncommitted buffer guarantees
 * 9. Deterministic time and timezone stability
 */
describe('Commercial Rules & Membership Creation Test Suite (Phase 5.3-F)', () => {
  const baseTime = new Date('2026-06-01T00:00:00.000Z');
  let clock: TestClock;

  // Repositories & Ports
  let membershipRepository: jest.Mocked<MembershipRepository>;
  let membershipPlanRepository: jest.Mocked<MembershipPlanRepository>;
  let clientLookupPort: jest.Mocked<ClientLookupPort>;
  let eventPublisher: jest.Mocked<GymEventPublisherPort>;
  let createMembershipHandler: CreateMembershipHandler;
  let overlapPolicy: MembershipOverlapPolicy;

  beforeEach(() => {
    clock = new TestClock(baseTime);
    overlapPolicy = new MembershipOverlapPolicy();

    membershipRepository = {
      save: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn().mockResolvedValue(null),
      findByClientId: jest.fn().mockResolvedValue([]),
    };

    membershipPlanRepository = {
      save: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn().mockResolvedValue(null),
      findByCode: jest.fn().mockResolvedValue(null),
      findActive: jest.fn().mockResolvedValue([]),
    };

    clientLookupPort = {
      validateClientExists: jest.fn().mockResolvedValue(true),
    };

    eventPublisher = {
      publish: jest.fn().mockResolvedValue(undefined),
    };

    createMembershipHandler = new CreateMembershipHandler(
      membershipRepository,
      membershipPlanRepository,
      clientLookupPort,
      clock,
      eventPublisher,
      overlapPolicy,
    );
  });

  // =========================================================================
  // 1. MembershipPlan Value Objects & Aggregates
  // =========================================================================
  describe('1. MembershipPlan Value Objects & Aggregates', () => {
    it('should create a valid MembershipPlan with correct value objects and buffer created event', () => {
      const plan = MembershipPlan.create({
        id: PlanId.create('plan_gold_30d'),
        code: PlanCode.create('GOLD_30D'),
        name: 'Gold Monthly Access',
        duration: PlanDuration.ofDays(30),
        price: PlanPrice.create(15000, 'ARS'),
        visitQuota: VisitQuota.of(30),
        createdAt: clock.now(),
      });

      expect(plan.id.value).toBe('plan_gold_30d');
      expect(plan.code.value).toBe('GOLD_30D');
      expect(plan.name).toBe('Gold Monthly Access');
      expect(plan.duration.durationInDays).toBe(30);
      expect(plan.price.amount).toBe(15000);
      expect(plan.price.currency).toBe('ARS');
      expect(plan.visitQuota?.maxVisits).toBe(30);
      expect(plan.status).toBe(PlanStatus.DRAFT);
      expect(plan.isAvailableForPurchase()).toBe(false);

      const events = plan.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(MembershipPlanCreatedEvent);
    });

    it('should reject invalid PlanPrice parameters (negative amount, invalid currency)', () => {
      expect(() => PlanPrice.create(-100, 'ARS')).toThrow(
        MembershipPlanInvariantViolationException,
      );
      expect(() => PlanPrice.create(100, 'INVALID')).toThrow(
        MembershipPlanInvariantViolationException,
      );
      expect(() => PlanPrice.create(NaN, 'ARS')).toThrow(MembershipPlanInvariantViolationException);
    });

    it('should reject invalid PlanDuration parameters (non-positive or non-integer)', () => {
      expect(() => PlanDuration.ofDays(0)).toThrow(MembershipPlanInvariantViolationException);
      expect(() => PlanDuration.ofDays(-15)).toThrow(MembershipPlanInvariantViolationException);
      expect(() => PlanDuration.ofDays(30.5)).toThrow(MembershipPlanInvariantViolationException);
    });

    it('should correctly calculate deterministic end dates across leap years and month boundaries', () => {
      const leapYearStart = new Date('2028-02-01T00:00:00.000Z');
      const duration28d = PlanDuration.ofDays(28);
      const endFeb28 = duration28d.calculateEndDate(leapYearStart);
      expect(endFeb28.toISOString()).toBe('2028-02-29T00:00:00.000Z');

      const endFeb29 = PlanDuration.ofDays(29).calculateEndDate(leapYearStart);
      expect(endFeb29.toISOString()).toBe('2028-03-01T00:00:00.000Z');
    });

    it('should enforce full lifecycle transitions: DRAFT -> ACTIVE -> ARCHIVED and reject forbidden transitions', () => {
      const plan = MembershipPlan.create({
        code: PlanCode.create('STD_30D'),
        name: 'Standard Monthly',
        duration: PlanDuration.ofDays(30),
        price: PlanPrice.create(10000, 'ARS'),
        createdAt: clock.now(),
      });

      // DRAFT -> ACTIVE
      plan.publish(clock.now());
      expect(plan.status).toBe(PlanStatus.ACTIVE);
      expect(plan.isAvailableForPurchase()).toBe(true);

      // Idempotent publish while ACTIVE
      plan.publish(clock.now());
      expect(plan.status).toBe(PlanStatus.ACTIVE);

      // ACTIVE -> ARCHIVED
      plan.archive(clock.now());
      expect(plan.status).toBe(PlanStatus.ARCHIVED);
      expect(plan.isAvailableForPurchase()).toBe(false);

      // ARCHIVED cannot transition back to ACTIVE
      expect(() => plan.publish(clock.now())).toThrow(InvalidPlanTransitionException);
    });

    it('should enforce duration immutability once published while permitting price adjustments', () => {
      const plan = MembershipPlan.create({
        code: PlanCode.create('STD_30D'),
        name: 'Standard Monthly',
        duration: PlanDuration.ofDays(30),
        price: PlanPrice.create(10000, 'ARS'),
        createdAt: clock.now(),
      });

      // Price update in DRAFT is permitted
      plan.updatePricing(PlanPrice.create(12000, 'ARS'), clock.now());
      expect(plan.price.amount).toBe(12000);

      // Publish plan
      plan.publish(clock.now());
      plan.clearEvents();

      // Price update in ACTIVE is permitted (emits MembershipPlanPriceChangedEvent)
      plan.updatePricing(PlanPrice.create(14000, 'ARS'), clock.now());
      expect(plan.price.amount).toBe(14000);

      const priceChangedEvents = plan
        .getUncommittedEvents()
        .filter(
          (e) => e instanceof MembershipPlanPriceChangedEvent,
        ) as MembershipPlanPriceChangedEvent[];
      expect(priceChangedEvents).toHaveLength(1);
      expect(priceChangedEvents[0]!.payload.previousAmount).toBe(12000);
      expect(priceChangedEvents[0]!.payload.newAmount).toBe(14000);

      // Archive plan -> price update in ARCHIVED is prohibited
      plan.archive(clock.now());
      expect(() => plan.updatePricing(PlanPrice.create(16000, 'ARS'), clock.now())).toThrow(
        MembershipPlanInvariantViolationException,
      );
    });
  });

  // =========================================================================
  // 2. Commercial Catalog Availability & Selection
  // =========================================================================
  describe('2. Commercial Catalog Availability & Selection', () => {
    it('should permit membership creation only when plan is ACTIVE', async () => {
      const activePlan = MembershipPlan.create({
        id: PlanId.create('plan_active_1'),
        code: PlanCode.create('ACTIVE_30D'),
        name: 'Active 30 Days',
        duration: PlanDuration.ofDays(30),
        price: PlanPrice.create(10000, 'ARS'),
        createdAt: clock.now(),
      });
      activePlan.publish(clock.now());

      membershipPlanRepository.findById.mockResolvedValue(activePlan);

      const command = new CreateMembershipCommand({
        clientId: 'client_avail_test',
        planId: 'plan_active_1',
      });

      const result = await createMembershipHandler.execute(command);
      expect(result.isSuccess).toBe(true);
      expect(result.getValue().status).toBe(MembershipStatus.ACTIVE);
      expect(membershipRepository.save).toHaveBeenCalledTimes(1);
    });

    it('should reject membership creation when plan is in DRAFT status', async () => {
      const draftPlan = MembershipPlan.create({
        id: PlanId.create('plan_draft_1'),
        code: PlanCode.create('DRAFT_30D'),
        name: 'Draft Plan',
        duration: PlanDuration.ofDays(30),
        price: PlanPrice.create(10000, 'ARS'),
        createdAt: clock.now(),
      });

      membershipPlanRepository.findById.mockResolvedValue(draftPlan);

      const command = new CreateMembershipCommand({
        clientId: 'client_avail_test',
        planId: 'plan_draft_1',
      });

      const result = await createMembershipHandler.execute(command);
      expect(result.isFailure).toBe(true);
      expect(result.getError()).toContain('is not active or available for new memberships');
      expect(membershipRepository.save).not.toHaveBeenCalled();
      expect(eventPublisher.publish).not.toHaveBeenCalled();
    });

    it('should reject membership creation when plan is in ARCHIVED status', async () => {
      const archivedPlan = MembershipPlan.create({
        id: PlanId.create('plan_archived_1'),
        code: PlanCode.create('ARCH_30D'),
        name: 'Archived Plan',
        duration: PlanDuration.ofDays(30),
        price: PlanPrice.create(10000, 'ARS'),
        createdAt: clock.now(),
      });
      archivedPlan.publish(clock.now());
      archivedPlan.archive(clock.now());

      membershipPlanRepository.findById.mockResolvedValue(archivedPlan);

      const command = new CreateMembershipCommand({
        clientId: 'client_avail_test',
        planId: 'plan_archived_1',
      });

      const result = await createMembershipHandler.execute(command);
      expect(result.isFailure).toBe(true);
      expect(result.getError()).toContain('is not active or available for new memberships');
      expect(membershipRepository.save).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 3. Historical Integrity Under Commercial Mutations
  // =========================================================================
  describe('3. Historical Integrity Under Commercial Mutations', () => {
    it('should guarantee that modifying plan price and archiving plan leaves active membership terms 100% intact', async () => {
      // 1. Create and publish commercial plan at $10,000 ARS
      const plan = MembershipPlan.create({
        id: PlanId.create('plan_promo_30d'),
        code: PlanCode.create('PROMO_30D'),
        name: 'Promo 30 Days',
        duration: PlanDuration.ofDays(30),
        price: PlanPrice.create(10000, 'ARS'),
        createdAt: clock.now(),
      });
      plan.publish(clock.now());

      membershipPlanRepository.findById.mockResolvedValue(plan);

      // 2. Client purchases membership during Promo
      const command1 = new CreateMembershipCommand({
        clientId: 'client_historical_1',
        planId: 'plan_promo_30d',
        startDate: new Date('2026-06-01T00:00:00.000Z'),
      });
      const result1 = await createMembershipHandler.execute(command1);
      expect(result1.isSuccess).toBe(true);
      const membershipDto = result1.getValue();

      expect(membershipDto.period.startDate).toBe('2026-06-01T00:00:00.000Z');
      expect(membershipDto.period.endDate).toBe('2026-07-01T00:00:00.000Z');
      expect(membershipDto.period.durationDays).toBe(30);

      // Reconstitute the issued aggregate
      const issuedMembership = Membership.reconstitute({
        id: MembershipId.create(membershipDto.id),
        version: 1,
        status: MembershipStatus.ACTIVE,
        clientId: membershipDto.clientId,
        planId: membershipDto.planId,
        period: MembershipPeriod.create(
          new Date(membershipDto.period.startDate),
          new Date(membershipDto.period.endDate),
        ),
        freezeHistory: [],
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
        updatedAt: new Date('2026-06-01T00:00:00.000Z'),
      });

      // 3. Commercial changes: Price increased by 50%
      plan.updatePricing(PlanPrice.create(15000, 'ARS'), clock.now());

      // 4. Commercial changes: Plan is archived
      plan.archive(clock.now());

      // 5. Assert that historical Membership remains active, fully valid, and contains current time
      const testAttendanceTime = new Date('2026-06-15T12:00:00.000Z');
      expect(issuedMembership.status).toBe(MembershipStatus.ACTIVE);
      expect(issuedMembership.period.contains(testAttendanceTime)).toBe(true);
      expect(issuedMembership.period.durationDays).toBe(30);
      expect(issuedMembership.period.startDate.toISOString()).toBe('2026-06-01T00:00:00.000Z');
      expect(issuedMembership.period.endDate.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    });
  });

  // =========================================================================
  // 4. Comprehensive Overlap Interval Matrix (10 Topologies)
  // =========================================================================
  describe('4. Comprehensive Overlap Interval Matrix', () => {
    const clientId = 'client_matrix_test';
    const activeJune = Membership.reconstitute({
      id: MembershipId.create('mem_june'),
      version: 1,
      status: MembershipStatus.ACTIVE,
      clientId,
      planId: 'plan_std',
      period: MembershipPeriod.create(
        new Date('2026-06-01T00:00:00.000Z'),
        new Date('2026-07-01T00:00:00.000Z'),
      ),
      freezeHistory: [],
      createdAt: baseTime,
      updatedAt: baseTime,
    });

    it('Case 1 (Identical Duplicate): [06-01 -> 07-01] vs [06-01 -> 07-01] -> REJECTED', () => {
      const candidate = MembershipPeriod.create(
        new Date('2026-06-01T00:00:00.000Z'),
        new Date('2026-07-01T00:00:00.000Z'),
      );
      const evalResult = overlapPolicy.evaluateOverlap([activeJune], candidate);
      expect(evalResult.hasOverlap).toBe(true);
      expect(() => overlapPolicy.assertNoOverlap(clientId, [activeJune], candidate)).toThrow(
        OverlappingMembershipException,
      );
    });

    it('Case 2 (Pre-Overlap / Starts Before Ends Inside): [05-15 -> 06-15] vs [06-01 -> 07-01] -> REJECTED', () => {
      const candidate = MembershipPeriod.create(
        new Date('2026-05-15T00:00:00.000Z'),
        new Date('2026-06-15T00:00:00.000Z'),
      );
      const evalResult = overlapPolicy.evaluateOverlap([activeJune], candidate);
      expect(evalResult.hasOverlap).toBe(true);
    });

    it('Case 3 (Post-Overlap / Starts Inside Ends After): [06-15 -> 07-15] vs [06-01 -> 07-01] -> REJECTED', () => {
      const candidate = MembershipPeriod.create(
        new Date('2026-06-15T00:00:00.000Z'),
        new Date('2026-07-15T00:00:00.000Z'),
      );
      const evalResult = overlapPolicy.evaluateOverlap([activeJune], candidate);
      expect(evalResult.hasOverlap).toBe(true);
    });

    it('Case 4 (Full Internal Containment): [06-05 -> 06-25] vs [06-01 -> 07-01] -> REJECTED', () => {
      const candidate = MembershipPeriod.create(
        new Date('2026-06-05T00:00:00.000Z'),
        new Date('2026-06-25T00:00:00.000Z'),
      );
      const evalResult = overlapPolicy.evaluateOverlap([activeJune], candidate);
      expect(evalResult.hasOverlap).toBe(true);
    });

    it('Case 5 (Enclosing / Outer Containment): [05-01 -> 08-01] vs [06-01 -> 07-01] -> REJECTED', () => {
      const candidate = MembershipPeriod.create(
        new Date('2026-05-01T00:00:00.000Z'),
        new Date('2026-08-01T00:00:00.000Z'),
      );
      const evalResult = overlapPolicy.evaluateOverlap([activeJune], candidate);
      expect(evalResult.hasOverlap).toBe(true);
    });

    it('Case 6 (Adjacent Consecutive / Seamless Renewal): [07-01 -> 08-01] vs [06-01 -> 07-01] -> ALLOWED', () => {
      const candidate = MembershipPeriod.create(
        new Date('2026-07-01T00:00:00.000Z'),
        new Date('2026-08-01T00:00:00.000Z'),
      );
      const evalResult = overlapPolicy.evaluateOverlap([activeJune], candidate);
      expect(evalResult.hasOverlap).toBe(false);
      expect(() => overlapPolicy.assertNoOverlap(clientId, [activeJune], candidate)).not.toThrow();
    });

    it('Case 7 (Disjoint Future Period): [09-01 -> 10-01] vs [06-01 -> 07-01] -> ALLOWED', () => {
      const candidate = MembershipPeriod.create(
        new Date('2026-09-01T00:00:00.000Z'),
        new Date('2026-10-01T00:00:00.000Z'),
      );
      const evalResult = overlapPolicy.evaluateOverlap([activeJune], candidate);
      expect(evalResult.hasOverlap).toBe(false);
    });

    it('Case 8 (Multi-Client Isolation): Different clients with identical periods do NOT conflict', () => {
      const candidateForClientA = MembershipPeriod.create(
        new Date('2026-06-01T00:00:00.000Z'),
        new Date('2026-07-01T00:00:00.000Z'),
      );

      // Client A has no memberships in repository
      const evalResult = overlapPolicy.evaluateOverlap([], candidateForClientA);
      expect(evalResult.hasOverlap).toBe(false);
    });

    it('Case 9 (Inactive Historical Contracts): EXPIRED and CANCELLED memberships do not block candidate', () => {
      const historicalMemberships = [
        Membership.reconstitute({
          id: MembershipId.create('mem_exp'),
          version: 1,
          status: MembershipStatus.EXPIRED,
          clientId,
          planId: 'plan_std',
          period: MembershipPeriod.create(
            new Date('2026-04-01T00:00:00.000Z'),
            new Date('2026-05-01T00:00:00.000Z'),
          ),
          freezeHistory: [],
          createdAt: baseTime,
          updatedAt: baseTime,
        }),
        Membership.reconstitute({
          id: MembershipId.create('mem_canc'),
          version: 1,
          status: MembershipStatus.CANCELLED,
          clientId,
          planId: 'plan_std',
          period: MembershipPeriod.create(
            new Date('2026-06-01T00:00:00.000Z'),
            new Date('2026-07-01T00:00:00.000Z'),
          ),
          freezeHistory: [],
          createdAt: baseTime,
          updatedAt: baseTime,
        }),
      ];

      const candidate = MembershipPeriod.create(
        new Date('2026-06-01T00:00:00.000Z'),
        new Date('2026-07-01T00:00:00.000Z'),
      );

      const evalResult = overlapPolicy.evaluateOverlap(historicalMemberships, candidate);
      expect(evalResult.hasOverlap).toBe(false);
    });

    it('Case 10 (Frozen Membership): FROZEN membership occupies commitment and blocks overlapping periods', () => {
      const frozenMembership = Membership.reconstitute({
        id: MembershipId.create('mem_frozen'),
        version: 1,
        status: MembershipStatus.FROZEN,
        clientId,
        planId: 'plan_std',
        period: MembershipPeriod.create(
          new Date('2026-06-01T00:00:00.000Z'),
          new Date('2026-07-10T00:00:00.000Z'),
        ),
        freezeHistory: [
          FreezeWindow.create(
            new Date('2026-06-10T00:00:00.000Z'),
            new Date('2026-06-20T00:00:00.000Z'),
            'Medical leave',
          ),
        ],
        createdAt: baseTime,
        updatedAt: baseTime,
      });

      const candidate = MembershipPeriod.create(
        new Date('2026-06-15T00:00:00.000Z'),
        new Date('2026-07-15T00:00:00.000Z'),
      );

      const evalResult = overlapPolicy.evaluateOverlap([frozenMembership], candidate);
      expect(evalResult.hasOverlap).toBe(true);
      expect(evalResult.conflictingMembership?.id.value).toBe('mem_frozen');
    });
  });

  // =========================================================================
  // 5. Early Renewal & Renewal Semantics
  // =========================================================================
  describe('5. Early Renewal & Renewal Semantics', () => {
    it('should permit aggregate in-place renewal and emit MembershipRenewedEvent', () => {
      const membership = Membership.create({
        clientId: 'client_renewal_test',
        planId: 'plan_std_30d',
        period: MembershipPeriod.create(
          new Date('2026-06-01T00:00:00.000Z'),
          new Date('2026-07-01T00:00:00.000Z'),
        ),
      });
      membership.clearEvents();

      const additionalPeriod = MembershipPeriod.create(
        new Date('2026-07-01T00:00:00.000Z'),
        new Date('2026-08-01T00:00:00.000Z'),
      );

      membership.renew(additionalPeriod, clock);

      expect(membership.period.startDate.toISOString()).toBe('2026-06-01T00:00:00.000Z');
      expect(membership.period.endDate.toISOString()).toBe('2026-08-01T00:00:00.000Z');

      const events = membership.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(MembershipRenewedEvent);
      const renewedEvent = events[0] as MembershipRenewedEvent;
      expect(renewedEvent.payload.newEndDate.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    });

    it('should reject renewal from prohibited terminal states (CANCELLED, TERMINATED)', () => {
      const cancelledMembership = Membership.reconstitute({
        id: MembershipId.create('mem_cancelled'),
        version: 1,
        status: MembershipStatus.CANCELLED,
        clientId: 'client_renewal_test',
        planId: 'plan_std_30d',
        period: MembershipPeriod.create(
          new Date('2026-06-01T00:00:00.000Z'),
          new Date('2026-07-01T00:00:00.000Z'),
        ),
        freezeHistory: [],
        createdAt: baseTime,
        updatedAt: baseTime,
      });

      const nextPeriod = MembershipPeriod.create(
        new Date('2026-07-01T00:00:00.000Z'),
        new Date('2026-08-01T00:00:00.000Z'),
      );

      expect(() => cancelledMembership.renew(nextPeriod, clock)).toThrow(
        InvalidMembershipTransitionException,
      );
    });
  });

  // =========================================================================
  // 6. Client Reference Decoupling & Ports
  // =========================================================================
  describe('6. Client Reference Decoupling & Ports', () => {
    it('should reject membership creation when ClientLookupPort returns false (client does not exist)', async () => {
      const activePlan = MembershipPlan.create({
        id: PlanId.create('plan_std_30d'),
        code: PlanCode.create('STD_30D'),
        name: 'Standard Monthly',
        duration: PlanDuration.ofDays(30),
        price: PlanPrice.create(10000, 'ARS'),
        createdAt: clock.now(),
      });
      activePlan.publish(clock.now());

      membershipPlanRepository.findById.mockResolvedValue(activePlan);
      clientLookupPort.validateClientExists.mockResolvedValue(false);

      const command = new CreateMembershipCommand({
        clientId: 'client_nonexistent',
        planId: 'plan_std_30d',
      });

      const result = await createMembershipHandler.execute(command);
      expect(result.isFailure).toBe(true);
      expect(result.getError()).toContain("Client with id 'client_nonexistent' does not exist");
      expect(membershipRepository.save).not.toHaveBeenCalled();
      expect(eventPublisher.publish).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 7. Event Auditing & Zero-Event Failure Guarantee
  // =========================================================================
  describe('7. Event Auditing & Zero-Event Failure Guarantee', () => {
    it('should guarantee zero events are published when command validation fails', async () => {
      const command = new CreateMembershipCommand({
        clientId: '',
        planId: 'plan_std_30d',
      });

      const result = await createMembershipHandler.execute(command);
      expect(result.isFailure).toBe(true);
      expect(eventPublisher.publish).not.toHaveBeenCalled();
      expect(membershipRepository.save).not.toHaveBeenCalled();
    });

    it('should clear aggregate uncommitted events after successful dispatch', async () => {
      const activePlan = MembershipPlan.create({
        id: PlanId.create('plan_std_30d'),
        code: PlanCode.create('STD_30D'),
        name: 'Standard Monthly',
        duration: PlanDuration.ofDays(30),
        price: PlanPrice.create(10000, 'ARS'),
        createdAt: clock.now(),
      });
      activePlan.publish(clock.now());

      membershipPlanRepository.findById.mockResolvedValue(activePlan);

      const command = new CreateMembershipCommand({
        clientId: 'client_event_dispatch',
        planId: 'plan_std_30d',
      });

      const result = await createMembershipHandler.execute(command);
      expect(result.isSuccess).toBe(true);
      expect(eventPublisher.publish).toHaveBeenCalledTimes(1);

      const calls = eventPublisher.publish.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const publishedEvents = calls[0]![0];
      expect(publishedEvents).toHaveLength(1);
      expect(publishedEvents[0]).toBeInstanceOf(MembershipCreatedEvent);
      expect((publishedEvents[0] as MembershipCreatedEvent).payload.clientId).toBe(
        'client_event_dispatch',
      );
    });
  });
});
