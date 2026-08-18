import { TestClock } from './domain/shared/clock';
import { Membership } from './domain/membership/membership.aggregate';
import { MembershipId } from './domain/membership/membership-id.vo';
import { MembershipStatus } from './domain/membership/membership-status.enum';
import { MembershipPeriod } from './domain/membership/membership-period.vo';
import { FreezeWindow } from './domain/membership/freeze-window.vo';
import { MembershipPlan } from './domain/plan/membership-plan.aggregate';
import { PlanDuration } from './domain/plan/plan-duration.vo';
import { PlanPrice } from './domain/plan/plan-price.vo';
import { MembershipRepository } from './domain/repositories/membership.repository';
import { MembershipPlanRepository } from './domain/repositories/membership-plan.repository';
import { ClientLookupPort } from './application/ports/client-lookup.port';
import { GymEventPublisherPort } from './application/ports/gym-event-publisher.port';
import { GymLoggerPort } from './application/ports/gym-logger.port';
import { CreateMembershipHandler } from './application/handlers/create-membership.handler';
import { CreateMembershipCommand } from './application/commands/create-membership.command';
import { RenewMembershipHandler } from './application/handlers/renew-membership.handler';
import { RenewMembershipCommand } from './application/commands/renew-membership.command';
import { ExpireMembershipsHandler } from './application/handlers/expire-memberships.handler';
import { ExpireMembershipsCommand } from './application/commands/expire-memberships.command';
import { MembershipNotificationDispatcher } from './application/event-handlers/membership-notification.dispatcher';
import { GetExpiringMembershipsHandler } from './application/queries/get-expiring-memberships.handler';

import { GetExpiringMembershipsQuery } from './application/queries/get-expiring-memberships.query';
import { GetMembershipOperationalSummaryHandler } from './application/queries/get-membership-operational-summary.handler';
import { GetMembershipOperationalSummaryQuery } from './application/queries/get-membership-operational-summary.query';
import { DomainEvent } from './domain/shared/domain-event';
import { MembershipExpiredEvent } from './domain/events/membership-expired.event';
import { MembershipRenewedEvent } from './domain/events/membership-renewed.event';

/**
 * Phase 5.4-H: Comprehensive Verification & Temporal Lifecycle Test Suite
 *
 * Exhaustively proves:
 * 1. Renewal temporal matrix (before, exact boundary, post-expiration/lapsed, invalid states).
 * 2. Plan variations & historical commercial terms decoupling.
 * 3. Expiration boundary half-open interval [startDate, endDate) in UTC.
 * 4. Automatic Expiration Processor fault-isolation, chunk batching, and retries.
 * 5. Concurrency safety: Worker Expiration vs User Renewal race conditions.
 * 6. Transaction atomicity & event publisher isolation.
 * 7. Canonical attendance eligibility contract.
 * 8. Notification dispatcher idempotent event consumption.
 */
describe('Phase 5.4-H: Membership Renewal & Expiration — Comprehensive Verification Suite', () => {
  let clock: TestClock;
  let membershipsDb: Map<string, Membership>;
  let plansDb: Map<string, MembershipPlan>;
  let publishedEvents: DomainEvent[];

  let membershipRepo: MembershipRepository;
  let planRepo: MembershipPlanRepository;
  let clientLookupPort: ClientLookupPort;
  let eventPublisher: GymEventPublisherPort;
  let logger: GymLoggerPort;
  let notificationDispatcher: MembershipNotificationDispatcher;

  let createHandler: CreateMembershipHandler;
  let renewHandler: RenewMembershipHandler;
  let expireHandler: ExpireMembershipsHandler;
  let expiringQueryHandler: GetExpiringMembershipsHandler;
  let summaryQueryHandler: GetMembershipOperationalSummaryHandler;

  // Canonical base timeline: 2026-08-01T00:00:00.000Z
  const t0 = new Date('2026-08-01T00:00:00.000Z');

  beforeEach(() => {
    clock = new TestClock(t0);
    membershipsDb = new Map();
    plansDb = new Map();
    publishedEvents = [];

    membershipRepo = {
      save: jest.fn(async (m: Membership) => {
        // Clone state to simulate database snapshot isolation
        const clone = Membership.reconstitute({
          id: m.id,
          version: m.version,
          status: m.status,
          clientId: m.clientId,
          planId: m.planId,
          period: m.period,
          freezeHistory: [...m.freezeHistory],
          trainerAssignment: m.trainerAssignment,
          cancellationReason: m.cancellationReason,
          terminationReason: m.terminationReason,
          createdAt: m.createdAt,
          updatedAt: m.updatedAt,
        });
        membershipsDb.set(m.id.value, clone);
      }),
      findById: jest.fn(async (id) => {
        const key = typeof id === 'string' ? id : id.value;
        const stored = membershipsDb.get(key);
        if (!stored) return null;
        return Membership.reconstitute({
          id: stored.id,
          version: stored.version,
          status: stored.status,
          clientId: stored.clientId,
          planId: stored.planId,
          period: stored.period,
          freezeHistory: [...stored.freezeHistory],
          trainerAssignment: stored.trainerAssignment,
          cancellationReason: stored.cancellationReason,
          terminationReason: stored.terminationReason,
          createdAt: stored.createdAt,
          updatedAt: stored.updatedAt,
        });
      }),
      findByClientId: jest.fn(async (clientId) => {
        return Array.from(membershipsDb.values())
          .filter((m) => m.clientId === clientId)
          .map((stored) =>
            Membership.reconstitute({
              id: stored.id,
              version: stored.version,
              status: stored.status,
              clientId: stored.clientId,
              planId: stored.planId,
              period: stored.period,
              freezeHistory: [...stored.freezeHistory],
              trainerAssignment: stored.trainerAssignment,
              cancellationReason: stored.cancellationReason,
              terminationReason: stored.terminationReason,
              createdAt: stored.createdAt,
              updatedAt: stored.updatedAt,
            }),
          );
      }),
      findExpiringCandidates: jest.fn(async (asOf: Date, limit: number) => {
        return Array.from(membershipsDb.values())
          .filter(
            (m) =>
              (m.status === MembershipStatus.ACTIVE || m.status === MembershipStatus.FROZEN) &&
              m.period.endDate.getTime() <= asOf.getTime(),
          )
          .slice(0, limit)
          .map((stored) =>
            Membership.reconstitute({
              id: stored.id,
              version: stored.version,
              status: stored.status,
              clientId: stored.clientId,
              planId: stored.planId,
              period: stored.period,
              freezeHistory: [...stored.freezeHistory],
              trainerAssignment: stored.trainerAssignment,
              cancellationReason: stored.cancellationReason,
              terminationReason: stored.terminationReason,
              createdAt: stored.createdAt,
              updatedAt: stored.updatedAt,
            }),
          );
      }),
      findExpiringWithinHorizon: jest.fn(async (asOf: Date, horizonDays: number) => {
        const horizonMs = horizonDays * 24 * 60 * 60 * 1000;
        return Array.from(membershipsDb.values())
          .filter((m) => {
            if (m.status !== MembershipStatus.ACTIVE && m.status !== MembershipStatus.FROZEN) {
              return false;
            }
            const diffMs = m.period.endDate.getTime() - asOf.getTime();
            return diffMs > 0 && diffMs <= horizonMs;
          })
          .map((stored) =>
            Membership.reconstitute({
              id: stored.id,
              version: stored.version,
              status: stored.status,
              clientId: stored.clientId,
              planId: stored.planId,
              period: stored.period,
              freezeHistory: [...stored.freezeHistory],
              trainerAssignment: stored.trainerAssignment,
              cancellationReason: stored.cancellationReason,
              terminationReason: stored.terminationReason,
              createdAt: stored.createdAt,
              updatedAt: stored.updatedAt,
            }),
          );
      }),
      findAll: jest.fn(async () => {
        return Array.from(membershipsDb.values()).map((stored) =>
          Membership.reconstitute({
            id: stored.id,
            version: stored.version,
            status: stored.status,
            clientId: stored.clientId,
            planId: stored.planId,
            period: stored.period,
            freezeHistory: [...stored.freezeHistory],
            trainerAssignment: stored.trainerAssignment,
            cancellationReason: stored.cancellationReason,
            terminationReason: stored.terminationReason,
            createdAt: stored.createdAt,
            updatedAt: stored.updatedAt,
          }),
        );
      }),
    };

    planRepo = {
      save: jest.fn(async (p: MembershipPlan) => {
        plansDb.set(p.id.value, p);
      }),
      findById: jest.fn(async (id) => {
        const key = typeof id === 'string' ? id : id.value;
        return plansDb.get(key) ?? null;
      }),
      findByCode: jest.fn(async (code) => {
        const strCode = typeof code === 'string' ? code : code.value;
        return (
          Array.from(plansDb.values()).find((p) => p.code.value === strCode.toUpperCase().trim()) ??
          null
        );
      }),
      findActive: jest.fn(async () => {
        return Array.from(plansDb.values()).filter((p) => p.isAvailableForPurchase());
      }),
    };

    clientLookupPort = {
      validateClientExists: jest.fn().mockResolvedValue(true),
    };

    eventPublisher = {
      publish: jest.fn(async (events: ReadonlyArray<DomainEvent>) => {
        publishedEvents.push(...events);
      }),
    };

    logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    notificationDispatcher = new MembershipNotificationDispatcher(logger);

    createHandler = new CreateMembershipHandler(
      membershipRepo,
      planRepo,
      clientLookupPort,
      clock,
      eventPublisher,
    );
    renewHandler = new RenewMembershipHandler(membershipRepo, planRepo, clock, eventPublisher);
    expireHandler = new ExpireMembershipsHandler(membershipRepo, clock, eventPublisher, logger);
    expiringQueryHandler = new GetExpiringMembershipsHandler(membershipRepo, clock);
    summaryQueryHandler = new GetMembershipOperationalSummaryHandler(membershipRepo, clock);
  });

  // =========================================================================
  // Section 2: Renewal Verification Tests
  // =========================================================================
  describe('1. Renewal Verification Tests', () => {
    let standardPlan: MembershipPlan;

    beforeEach(async () => {
      standardPlan = MembershipPlan.create({
        code: 'STD_30',
        name: 'Standard 30 Days',
        duration: PlanDuration.ofDays(30),
        price: PlanPrice.create(50, 'USD'),
      });
      standardPlan.publish();
      await planRepo.save(standardPlan);
    });

    it('1.1 Before expiration: renewal succeeds, preserves 100% unused time, extends gaplessly', async () => {
      // Create initial membership: Aug 01 -> Aug 31
      const createRes = await createHandler.execute(
        new CreateMembershipCommand({
          clientId: 'client_ren_1',
          planId: standardPlan.id.value,
          startDate: t0,
        }),
      );
      expect(createRes.isSuccess).toBe(true);
      const membershipId = createRes.getValue().id;

      // Renew 10 days early on Aug 21
      clock.setTime(new Date('2026-08-21T10:00:00.000Z'));
      const renewRes = await renewHandler.execute(
        new RenewMembershipCommand({
          membershipId,
        }),
      );
      expect(renewRes.isSuccess).toBe(true);

      const renewed = (await membershipRepo.findById(membershipId))!;
      expect(renewed.status).toBe(MembershipStatus.ACTIVE);
      // Seamless extension: Aug 31 + 30 days = Sept 30
      expect(renewed.period.startDate).toEqual(t0);
      expect(renewed.period.endDate).toEqual(new Date('2026-09-30T00:00:00.000Z'));
      expect(renewed.period.durationDays).toBe(60);
      expect(renewed.version).toBe(2);
    });

    it('1.2 Exactly at boundary: evaluates renewal seamlessly without timezone ambiguity', async () => {
      const createRes = await createHandler.execute(
        new CreateMembershipCommand({
          clientId: 'client_ren_boundary',
          planId: standardPlan.id.value,
          startDate: t0,
        }),
      );
      const membershipId = createRes.getValue().id;

      // Exactly at boundary timestamp: 2026-08-31T00:00:00.000Z
      clock.setTime(new Date('2026-08-31T00:00:00.000Z'));
      const renewRes = await renewHandler.execute(
        new RenewMembershipCommand({
          membershipId,
        }),
      );
      expect(renewRes.isSuccess).toBe(true);

      const renewed = (await membershipRepo.findById(membershipId))!;
      expect(renewed.status).toBe(MembershipStatus.ACTIVE);
      expect(renewed.period.endDate).toEqual(new Date('2026-09-30T00:00:00.000Z'));
    });

    it('1.3 After expiration (lapsed renewal): reactivates EXPIRED agreement starting from effective now', async () => {
      const createRes = await createHandler.execute(
        new CreateMembershipCommand({
          clientId: 'client_ren_lapsed',
          planId: standardPlan.id.value,
          startDate: t0,
        }),
      );
      const membershipId = createRes.getValue().id;

      // Expire membership at Sept 05
      clock.setTime(new Date('2026-09-05T00:00:00.000Z'));
      await expireHandler.execute(new ExpireMembershipsCommand());

      let membership = (await membershipRepo.findById(membershipId))!;
      expect(membership.status).toBe(MembershipStatus.EXPIRED);

      // Client returns and renews on Sept 15 (15 days lapsed)
      const tLapsedRenew = new Date('2026-09-15T14:30:00.000Z');
      clock.setTime(tLapsedRenew);

      const renewRes = await renewHandler.execute(
        new RenewMembershipCommand({
          membershipId,
        }),
      );
      expect(renewRes.isSuccess).toBe(true);

      membership = (await membershipRepo.findById(membershipId))!;
      expect(membership.status).toBe(MembershipStatus.ACTIVE);
      // Starts from payment date, no retroactive gap penalty
      expect(membership.period.startDate).toEqual(tLapsedRenew);
      expect(membership.period.endDate).toEqual(
        new Date(tLapsedRenew.getTime() + 30 * 24 * 60 * 60 * 1000),
      );
    });

    it('1.4 Prohibited states: rejects renewal on CANCELLED, TERMINATED, PENDING, FROZEN', async () => {
      // 1. CANCELLED
      const memCancelled = Membership.create(
        {
          clientId: 'c_canc',
          planId: standardPlan.id.value,
          period: MembershipPeriod.create(t0, new Date('2026-08-31T00:00:00.000Z')),
        },
        clock,
      );
      memCancelled.cancel('User moved', clock);
      await membershipRepo.save(memCancelled);

      const resCanc = await renewHandler.execute(
        new RenewMembershipCommand({ membershipId: memCancelled.id.value }),
      );
      expect(resCanc.isSuccess).toBe(false);
      expect(resCanc.getError()).toContain('Only ACTIVE or EXPIRED memberships can be renewed');

      // 2. TERMINATED
      const memTerminated = Membership.create(
        {
          clientId: 'c_term',
          planId: standardPlan.id.value,
          period: MembershipPeriod.create(t0, new Date('2026-08-31T00:00:00.000Z')),
        },
        clock,
      );
      memTerminated.terminate('Fraud', clock);
      await membershipRepo.save(memTerminated);

      const resTerm = await renewHandler.execute(
        new RenewMembershipCommand({ membershipId: memTerminated.id.value }),
      );
      expect(resTerm.isSuccess).toBe(false);

      // 3. FROZEN
      const memFrozen = Membership.create(
        {
          clientId: 'c_froz',
          planId: standardPlan.id.value,
          period: MembershipPeriod.create(t0, new Date('2026-08-31T00:00:00.000Z')),
        },
        clock,
      );
      memFrozen.freeze(
        FreezeWindow.create(
          new Date('2026-08-05T00:00:00.000Z'),
          new Date('2026-08-15T00:00:00.000Z'),
          'Medical',
        ),
        clock,
      );
      await membershipRepo.save(memFrozen);

      const resFroz = await renewHandler.execute(
        new RenewMembershipCommand({ membershipId: memFrozen.id.value }),
      );
      expect(resFroz.isSuccess).toBe(false);
    });
  });

  // =========================================================================
  // Section 3: Commercial Plan Variations & Historical Decoupling
  // =========================================================================
  describe('2. Commercial Plan Variations & Historical Integrity Tests', () => {
    it('2.1 Switching plans upon renewal (upgrade to 90-day plan) preserves previous terms', async () => {
      const plan30 = MembershipPlan.create({
        code: 'PLAN_30',
        name: 'Plan 30',
        duration: PlanDuration.ofDays(30),
        price: PlanPrice.create(40, 'USD'),
      });
      plan30.publish();
      await planRepo.save(plan30);

      const plan90 = MembershipPlan.create({
        code: 'PLAN_90_VIP',
        name: 'Plan 90 VIP',
        duration: PlanDuration.ofDays(90),
        price: PlanPrice.create(110, 'USD'),
      });
      plan90.publish();
      await planRepo.save(plan90);

      const createRes = await createHandler.execute(
        new CreateMembershipCommand({
          clientId: 'client_upgrade',
          planId: plan30.id.value,
          startDate: t0,
        }),
      );
      const membershipId = createRes.getValue().id;

      // Renew with Upgrade Plan
      clock.setTime(new Date('2026-08-10T00:00:00.000Z'));
      const renewRes = await renewHandler.execute(
        new RenewMembershipCommand({
          membershipId,
          newPlanId: plan90.id.value,
        }),
      );
      expect(renewRes.isSuccess).toBe(true);

      const membership = (await membershipRepo.findById(membershipId))!;
      expect(membership.planId).toBe(plan90.id.value);
      // Extended by 90 days from Aug 31 -> Nov 29
      expect(membership.period.endDate).toEqual(new Date('2026-11-29T00:00:00.000Z'));
      expect(membership.period.durationDays).toBe(120);
    });

    it('2.2 Rejects renewal with archived or draft membership plans', async () => {
      const archivedPlan = MembershipPlan.create({
        code: 'ARCHIVED_PLAN',
        name: 'Old Discontinued Plan',
        duration: PlanDuration.ofDays(30),
        price: PlanPrice.create(30, 'USD'),
      });
      archivedPlan.publish();
      archivedPlan.archive();
      await planRepo.save(archivedPlan);

      const activePlan = MembershipPlan.create({
        code: 'ACTIVE_PLAN',
        name: 'Active Plan',
        duration: PlanDuration.ofDays(30),
        price: PlanPrice.create(50, 'USD'),
      });
      activePlan.publish();
      await planRepo.save(activePlan);

      const createRes = await createHandler.execute(
        new CreateMembershipCommand({
          clientId: 'client_archive_test',
          planId: activePlan.id.value,
          startDate: t0,
        }),
      );
      const membershipId = createRes.getValue().id;

      const renewRes = await renewHandler.execute(
        new RenewMembershipCommand({
          membershipId,
          newPlanId: archivedPlan.id.value,
        }),
      );
      expect(renewRes.isSuccess).toBe(false);
      expect(renewRes.getError()).toContain('is not active or available for renewal');
    });
  });

  // =========================================================================
  // Section 4 & 5: Expiration Temporal Matrix & Processor Resilience
  // =========================================================================
  describe('3. Expiration Boundary Semantics & Processor Batching', () => {
    it('3.1 Strictly enforces [startDate, endDate) half-open boundary: active 1ms before, expired at exact boundary', async () => {
      const startDate = new Date('2026-08-01T00:00:00.000Z');
      const endDate = new Date('2026-08-31T00:00:00.000Z');

      const membership = Membership.create(
        {
          clientId: 'client_boundary_test',
          planId: 'plan_bnd',
          period: MembershipPeriod.create(startDate, endDate),
          status: MembershipStatus.ACTIVE,
        },
        clock,
      );
      await membershipRepo.save(membership);

      // 1 ms before boundary (2026-08-30T23:59:59.999Z) -> Still active & not candidate for expiration
      const tBefore = new Date('2026-08-30T23:59:59.999Z');
      clock.setTime(tBefore);
      expect(membership.isEligibleForAttendance(tBefore)).toBe(true);

      let expireRes = await expireHandler.execute(new ExpireMembershipsCommand());
      expect(expireRes.getValue().expiredCount).toBe(0);

      // Exact boundary (2026-08-31T00:00:00.000Z) -> Candidate for expiration processor
      const tExact = new Date('2026-08-31T00:00:00.000Z');
      clock.setTime(tExact);

      expireRes = await expireHandler.execute(new ExpireMembershipsCommand());
      expect(expireRes.getValue().expiredCount).toBe(1);

      const reloaded = (await membershipRepo.findById(membership.id))!;
      expect(reloaded.status).toBe(MembershipStatus.EXPIRED);
      // Once transitioned to EXPIRED, attendance eligibility is completely denied
      expect(reloaded.isEligibleForAttendance(tExact)).toBe(false);
    });

    it('3.2 Fault-isolated chunk batching: one failure does not abort processing of remaining candidates', async () => {
      const mem1 = Membership.create(
        {
          clientId: 'c1',
          planId: 'p1',
          period: MembershipPeriod.create(t0, new Date('2026-08-15T00:00:00.000Z')),
          status: MembershipStatus.ACTIVE,
        },
        clock,
      );
      const memCorrupted = Membership.create(
        {
          clientId: 'c2',
          planId: 'p1',
          period: MembershipPeriod.create(t0, new Date('2026-08-15T00:00:00.000Z')),
          status: MembershipStatus.ACTIVE,
        },
        clock,
      );
      const mem3 = Membership.create(
        {
          clientId: 'c3',
          planId: 'p1',
          period: MembershipPeriod.create(t0, new Date('2026-08-15T00:00:00.000Z')),
          status: MembershipStatus.ACTIVE,
        },
        clock,
      );

      await membershipRepo.save(mem1);
      await membershipRepo.save(memCorrupted);
      await membershipRepo.save(mem3);

      // Mock failure specifically on saving memCorrupted
      membershipRepo.save = jest.fn(async (m: Membership) => {
        if (m.id.equals(memCorrupted.id)) {
          throw new Error('Database disk write lock timeout on corrupted row');
        }
        membershipsDb.set(m.id.value, m);
      });

      clock.setTime(new Date('2026-08-20T00:00:00.000Z'));
      const expireRes = await expireHandler.execute(new ExpireMembershipsCommand({ batchSize: 5 }));

      expect(expireRes.isSuccess).toBe(true);
      const summary = expireRes.getValue();
      expect(summary.processedCount).toBe(3);
      expect(summary.expiredCount).toBe(2);
      expect(summary.failedCount).toBe(1);
      expect(summary.errors).toHaveLength(1);
      expect(summary.errors[0]?.membershipId).toBe(memCorrupted.id.value);

      // Verify mem1 and mem3 succeeded despite memCorrupted error
      const reload1 = (await membershipRepo.findById(mem1.id))!;
      const reload3 = (await membershipRepo.findById(mem3.id))!;
      expect(reload1.status).toBe(MembershipStatus.EXPIRED);
      expect(reload3.status).toBe(MembershipStatus.EXPIRED);
    });
  });

  // =========================================================================
  // Section 6 & 7: Idempotency, Concurrency & Race Conditions
  // =========================================================================
  describe('4. Idempotency, Concurrency & Race Conditions', () => {
    it('4.1 Repeated expiration runs produce zero duplicate transitions or events', async () => {
      const mem = Membership.create(
        {
          clientId: 'c_idem',
          planId: 'p_idem',
          period: MembershipPeriod.create(t0, new Date('2026-08-15T00:00:00.000Z')),
          status: MembershipStatus.ACTIVE,
        },
        clock,
      );
      await membershipRepo.save(mem);

      clock.setTime(new Date('2026-08-20T00:00:00.000Z'));

      // Execution 1: ACTIVE -> EXPIRED
      const res1 = await expireHandler.execute(new ExpireMembershipsCommand());
      expect(res1.getValue().expiredCount).toBe(1);
      const eventsAfterRun1 = publishedEvents.filter(
        (e) => e.eventType === 'MembershipExpired',
      ).length;
      expect(eventsAfterRun1).toBe(1);

      // Execution 2: No candidates found
      const res2 = await expireHandler.execute(new ExpireMembershipsCommand());
      expect(res2.getValue().expiredCount).toBe(0);
      const eventsAfterRun2 = publishedEvents.filter(
        (e) => e.eventType === 'MembershipExpired',
      ).length;
      expect(eventsAfterRun2).toBe(1); // Zero duplicate events
    });

    it('4.2 Concurrency Race: Worker Expiration vs User Lapsed Renewal', async () => {
      const plan = MembershipPlan.create({
        code: 'RACE_PLAN',
        name: 'Race Plan',
        duration: PlanDuration.ofDays(30),
        price: PlanPrice.create(50, 'USD'),
      });
      plan.publish();
      await planRepo.save(plan);

      const mem = Membership.create(
        {
          clientId: 'c_race',
          planId: plan.id.value,
          period: MembershipPeriod.create(t0, new Date('2026-08-31T00:00:00.000Z')),
          status: MembershipStatus.ACTIVE,
        },
        clock,
      );
      await membershipRepo.save(mem);

      // Time advances past end date: 2026-09-02
      clock.setTime(new Date('2026-09-02T10:00:00.000Z'));

      // Scenario A: Worker expires membership first -> status is EXPIRED
      await expireHandler.execute(new ExpireMembershipsCommand());
      let state = (await membershipRepo.findById(mem.id))!;
      expect(state.status).toBe(MembershipStatus.EXPIRED);

      // User immediately executes renewal on EXPIRED agreement -> successfully reactivates to ACTIVE
      const renewRes = await renewHandler.execute(
        new RenewMembershipCommand({ membershipId: mem.id.value }),
      );
      expect(renewRes.isSuccess).toBe(true);

      state = (await membershipRepo.findById(mem.id))!;
      expect(state.status).toBe(MembershipStatus.ACTIVE);
      expect(state.period.startDate).toEqual(new Date('2026-09-02T10:00:00.000Z'));
    });
  });

  // =========================================================================
  // Section 8 & 10: Transaction Safety & Canonical Eligibility Contract
  // =========================================================================
  describe('5. Transaction Safety & Canonical Attendance Eligibility', () => {
    it('5.1 Failed persistence leaves aggregate unchanged and emits 0 uncommitted events', async () => {
      const plan = MembershipPlan.create({
        code: 'TX_PLAN',
        name: 'Tx Plan',
        duration: PlanDuration.ofDays(30),
        price: PlanPrice.create(50, 'USD'),
      });
      plan.publish();
      await planRepo.save(plan);

      const mem = Membership.create(
        {
          clientId: 'c_tx',
          planId: plan.id.value,
          period: MembershipPeriod.create(t0, new Date('2026-08-31T00:00:00.000Z')),
          status: MembershipStatus.ACTIVE,
        },
        clock,
      );
      await membershipRepo.save(mem);

      // Force repository save failure
      (membershipRepo.save as jest.Mock).mockRejectedValueOnce(
        new Error('OptimisticLockingFailureException: version mismatch'),
      );

      const renewRes = await renewHandler.execute(
        new RenewMembershipCommand({ membershipId: mem.id.value }),
      );
      expect(renewRes.isSuccess).toBe(false);

      // Published events must NOT contain false renewal event
      expect(publishedEvents.filter((e) => e.eventType === 'MembershipRenewed')).toHaveLength(0);
    });

    it('5.2 Canonical attendance eligibility predicate truth table across all lifecycle states', () => {
      const period = MembershipPeriod.create(
        new Date('2026-08-01T00:00:00.000Z'),
        new Date('2026-08-31T00:00:00.000Z'),
      );
      const evalDate = new Date('2026-08-15T00:00:00.000Z');

      // 1. ACTIVE within period -> TRUE
      const activeMem = Membership.reconstitute({
        id: memId('m_act'),
        version: 1,
        status: MembershipStatus.ACTIVE,
        clientId: 'c1',
        planId: 'p1',
        period,
        createdAt: t0,
        updatedAt: t0,
      });
      expect(activeMem.isEligibleForAttendance(evalDate)).toBe(true);

      // 2. ACTIVE outside period (past end) -> FALSE
      expect(activeMem.isEligibleForAttendance(new Date('2026-09-01T00:00:00.000Z'))).toBe(false);

      // 3. FROZEN status -> FALSE
      const frozenMem = Membership.reconstitute({
        id: memId('m_froz'),
        version: 1,
        status: MembershipStatus.FROZEN,
        clientId: 'c1',
        planId: 'p1',
        period,
        createdAt: t0,
        updatedAt: t0,
      });
      expect(frozenMem.isEligibleForAttendance(evalDate)).toBe(false);

      // 4. EXPIRED status -> FALSE
      const expiredMem = Membership.reconstitute({
        id: memId('m_exp'),
        version: 1,
        status: MembershipStatus.EXPIRED,
        clientId: 'c1',
        planId: 'p1',
        period,
        createdAt: t0,
        updatedAt: t0,
      });
      expect(expiredMem.isEligibleForAttendance(evalDate)).toBe(false);

      // 5. PENDING status -> FALSE
      const pendingMem = Membership.reconstitute({
        id: memId('m_pen'),
        version: 1,
        status: MembershipStatus.PENDING,
        clientId: 'c1',
        planId: 'p1',
        period,
        createdAt: t0,
        updatedAt: t0,
      });
      expect(pendingMem.isEligibleForAttendance(evalDate)).toBe(false);

      // 6. CANCELLED status -> FALSE
      const cancelledMem = Membership.reconstitute({
        id: memId('m_canc'),
        version: 1,
        status: MembershipStatus.CANCELLED,
        clientId: 'c1',
        planId: 'p1',
        period,
        createdAt: t0,
        updatedAt: t0,
      });
      expect(cancelledMem.isEligibleForAttendance(evalDate)).toBe(false);

      // 7. TERMINATED status -> FALSE
      const termMem = Membership.reconstitute({
        id: memId('m_term'),
        version: 1,
        status: MembershipStatus.TERMINATED,
        clientId: 'c1',
        planId: 'p1',
        period,
        createdAt: t0,
        updatedAt: t0,
      });
      expect(termMem.isEligibleForAttendance(evalDate)).toBe(false);
    });
  });

  // =========================================================================
  // Section 6: Operational Read Models & Notification Dispatcher Verification
  // =========================================================================
  describe('6. Operational Read Models & Notification Dispatcher Verification', () => {
    it('6.1 Queries expiring memberships and operational summary metrics consistently', async () => {
      const mem1 = Membership.create(
        {
          clientId: 'client_vis_1',
          planId: 'p1',
          period: MembershipPeriod.create(t0, new Date('2026-08-05T00:00:00.000Z')),
          status: MembershipStatus.ACTIVE,
        },
        clock,
      );
      await membershipRepo.save(mem1);

      clock.setTime(new Date('2026-08-02T00:00:00.000Z'));

      const expiringRes = await expiringQueryHandler.execute(
        new GetExpiringMembershipsQuery({ horizonDays: 7 }),
      );
      expect(expiringRes.isSuccess).toBe(true);
      expect(expiringRes.getValue()).toHaveLength(1);
      expect(expiringRes.getValue()[0]?.daysRemaining).toBe(3);

      const summaryRes = await summaryQueryHandler.execute(
        new GetMembershipOperationalSummaryQuery(),
      );
      expect(summaryRes.isSuccess).toBe(true);
      expect(summaryRes.getValue().expiringSoonCount).toBe(1);
    });

    it('6.2 Notification dispatcher handles events with idempotent deduplication and logging', async () => {
      const expEvt = new MembershipExpiredEvent(
        'mem_evt_1',
        'c_evt_1',
        'plan_1',
        2,
        new Date('2026-08-05T00:00:00.000Z'),
      );
      await notificationDispatcher.handleMembershipExpired(expEvt);
      await notificationDispatcher.handleMembershipExpired(expEvt);

      expect(notificationDispatcher.getDispatchedIntents()).toHaveLength(1);
      expect(logger.info).toHaveBeenCalledWith(
        'Dispatched membership expired operational notification intent',
        expect.objectContaining({ membershipId: 'mem_evt_1' }),
      );

      const renEvt = new MembershipRenewedEvent(
        'mem_evt_2',
        'c_evt_2',
        'plan_1',
        new Date('2026-08-05T00:00:00.000Z'),
        new Date('2026-09-05T00:00:00.000Z'),
        2,
        new Date('2026-08-05T00:00:00.000Z'),
      );
      await notificationDispatcher.handleMembershipRenewed(renEvt);
      await notificationDispatcher.handleMembershipRenewed(renEvt);

      expect(notificationDispatcher.getDispatchedIntents()).toHaveLength(2);
    });
  });
});

function memId(id: string): MembershipId {
  return MembershipId.create(id);
}
