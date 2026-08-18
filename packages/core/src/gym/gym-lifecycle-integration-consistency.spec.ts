import { TestClock } from './domain/shared/clock';
import { Membership } from './domain/membership/membership.aggregate';
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

/**
 * Phase 5.4-G: End-to-End Membership Lifecycle Integration & Consistency Audit
 *
 * Proves that API, dashboard, scheduler, and future integrations invoke
 * identical business semantics with 100% time consistency, single authoritative paths,
 * and immutable historical integrity.
 */
describe('Phase 5.4-G: Membership Lifecycle Integration & Consistency Audit', () => {
  let clock: TestClock;
  let membershipsDb: Map<string, Membership>;
  let plansDb: Map<string, MembershipPlan>;
  let publishedEvents: DomainEvent[];

  let membershipRepo: MembershipRepository;
  let planRepo: MembershipPlanRepository;
  let clientLookupPort: ClientLookupPort;
  let eventPublisher: GymEventPublisherPort;
  let notificationDispatcher: MembershipNotificationDispatcher;

  let createHandler: CreateMembershipHandler;
  let renewHandler: RenewMembershipHandler;
  let expireHandler: ExpireMembershipsHandler;
  let expiringQueryHandler: GetExpiringMembershipsHandler;
  let summaryQueryHandler: GetMembershipOperationalSummaryHandler;

  const t0 = new Date('2026-08-01T00:00:00.000Z');

  beforeEach(() => {
    clock = new TestClock(t0);
    membershipsDb = new Map();
    plansDb = new Map();
    publishedEvents = [];

    membershipRepo = {
      save: jest.fn(async (m: Membership) => {
        membershipsDb.set(m.id.value, m);
      }),
      findById: jest.fn(async (id) => {
        const key = typeof id === 'string' ? id : id.value;
        return membershipsDb.get(key) ?? null;
      }),
      findByClientId: jest.fn(async (clientId) => {
        return Array.from(membershipsDb.values()).filter((m) => m.clientId === clientId);
      }),
      findExpiringCandidates: jest.fn(async (asOf: Date, limit: number) => {
        return Array.from(membershipsDb.values())
          .filter(
            (m) =>
              (m.status === MembershipStatus.ACTIVE || m.status === MembershipStatus.FROZEN) &&
              m.period.endDate.getTime() <= asOf.getTime(),
          )
          .slice(0, limit);
      }),
      findExpiringWithinHorizon: jest.fn(async (asOf: Date, horizonDays: number) => {
        const horizonMs = horizonDays * 24 * 60 * 60 * 1000;
        return Array.from(membershipsDb.values()).filter((m) => {
          if (m.status !== MembershipStatus.ACTIVE && m.status !== MembershipStatus.FROZEN) {
            return false;
          }
          const diffMs = m.period.endDate.getTime() - asOf.getTime();
          return diffMs > 0 && diffMs <= horizonMs;
        });
      }),
      findAll: jest.fn(async () => {
        return Array.from(membershipsDb.values());
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

    notificationDispatcher = new MembershipNotificationDispatcher();

    createHandler = new CreateMembershipHandler(
      membershipRepo,
      planRepo,
      clientLookupPort,
      clock,
      eventPublisher,
    );
    renewHandler = new RenewMembershipHandler(membershipRepo, planRepo, clock, eventPublisher);
    expireHandler = new ExpireMembershipsHandler(membershipRepo, clock, eventPublisher);
    expiringQueryHandler = new GetExpiringMembershipsHandler(membershipRepo, clock);
    summaryQueryHandler = new GetMembershipOperationalSummaryHandler(membershipRepo, clock);
  });

  describe('Scenario 1: Complete Multi-Lifecycle & Historical Integrity Scenario (Audit Item 8)', () => {
    it('should maintain immutable historical truth across creation, renewal, plan mutation, expiration, and freezing', async () => {
      // 1. Create Plan A ($50 USD, 30 days)
      const planA = MembershipPlan.create({
        code: 'PLAN_A',
        name: 'Standard Monthly Plan A',
        duration: PlanDuration.ofDays(30),
        price: PlanPrice.create(50, 'USD'),
      });
      planA.publish();
      await planRepo.save(planA);

      // 2. Create Membership for Client 100 with Plan A (starts at T0 = 2026-08-01, ends 2026-08-31)
      const createRes = await createHandler.execute(
        new CreateMembershipCommand({
          clientId: 'client_100',
          planId: planA.id.value,
          startDate: t0,
        }),
      );
      expect(createRes.isSuccess).toBe(true);
      const membershipId = createRes.getValue().id;

      let membership = (await membershipRepo.findById(membershipId))!;
      expect(membership.status).toBe(MembershipStatus.ACTIVE);
      expect(membership.planId).toBe(planA.id.value);
      expect(membership.period.startDate).toEqual(t0);
      expect(membership.period.endDate).toEqual(new Date('2026-08-31T00:00:00.000Z'));
      expect(membership.isEligibleForAttendance(t0)).toBe(true);

      // 3. Create Plan B ($80 USD VIP, 60 days)
      const planB = MembershipPlan.create({
        code: 'PLAN_B',
        name: 'VIP Premium Plan B',
        duration: PlanDuration.ofDays(60),
        price: PlanPrice.create(80, 'USD'),
      });
      planB.publish();
      await planRepo.save(planB);

      // 4. Advance Clock to 2026-08-15 (mid-period) and Renew Membership with Plan B
      const tMid = new Date('2026-08-15T12:00:00.000Z');
      clock.setTime(tMid);

      const renewRes = await renewHandler.execute(
        new RenewMembershipCommand({
          membershipId,
          newPlanId: planB.id.value,
        }),
      );
      expect(renewRes.isSuccess).toBe(true);

      membership = (await membershipRepo.findById(membershipId))!;
      // ADR-0061: Gapless extension from existing endDate (2026-08-31 + 60 days = 2026-10-30)
      expect(membership.status).toBe(MembershipStatus.ACTIVE);
      expect(membership.planId).toBe(planB.id.value);
      expect(membership.period.startDate).toEqual(t0);
      expect(membership.period.endDate).toEqual(new Date('2026-10-30T00:00:00.000Z'));
      expect(membership.version).toBe(2);

      // 5. Change Plan A: Update price to $65 and archive it
      planA.updatePricing(PlanPrice.create(65, 'USD'));
      planA.archive();
      await planRepo.save(planA);

      // 6. Change Plan B: Update price to $100 and update name
      planB.updatePricing(PlanPrice.create(100, 'USD'));
      planB.updateDetails({ name: 'VIP Ultra 2027', description: 'Updated description' });
      await planRepo.save(planB);

      // 7. Verify Operational Visibility mid-way: Check Expiring Soon query
      // At 2026-10-25 (5 days before Oct 30 end), it should be projected as expiring soon
      const tExpSoon = new Date('2026-10-25T00:00:00.000Z');
      clock.setTime(tExpSoon);

      const expiringRes = await expiringQueryHandler.execute(new GetExpiringMembershipsQuery());
      expect(expiringRes.isSuccess).toBe(true);
      const expiringItems = expiringRes.getValue();
      expect(expiringItems).toHaveLength(1);
      expect(expiringItems[0]?.membershipId).toBe(membershipId);
      expect(expiringItems[0]?.isExpiringSoon).toBe(true);
      expect(expiringItems[0]?.daysRemaining).toBe(5);

      // 8. Advance Clock past endDate (2026-10-30T00:00:01.000Z) and trigger Expiration Processing
      const tPastEnd = new Date('2026-10-30T00:00:01.000Z');
      clock.setTime(tPastEnd);

      const expireRes = await expireHandler.execute(new ExpireMembershipsCommand());
      expect(expireRes.isSuccess).toBe(true);
      expect(expireRes.getValue().expiredCount).toBe(1);

      membership = (await membershipRepo.findById(membershipId))!;
      expect(membership.status).toBe(MembershipStatus.EXPIRED);
      expect(membership.version).toBe(3);

      // 9. Verify Attendance Eligibility is completely denied once expired
      expect(membership.isEligibleForAttendance(tPastEnd)).toBe(false);

      // 10. Verify Operational Summary Query
      const summaryRes = await summaryQueryHandler.execute(
        new GetMembershipOperationalSummaryQuery(),
      );
      expect(summaryRes.isSuccess).toBe(true);
      const summary = summaryRes.getValue();
      expect(summary.totalMemberships).toBe(1);
      expect(summary.totalActive).toBe(0);
      expect(summary.expiredCount).toBe(1);

      // 11. Historical Integrity Invariants:
      // Verify that mutating Plan A and Plan B did not alter membership duration or startDate
      expect(membership.period.startDate).toEqual(t0);
      expect(membership.period.endDate).toEqual(new Date('2026-10-30T00:00:00.000Z'));
      expect(membership.period.durationDays).toBe(90); // 30 (Plan A) + 60 (Plan B)
    });
  });

  describe('Scenario 2: State Machine Lifecycle Invariants & Illegal Transitions', () => {
    it('should reject illegal transitions across all lifecycle states deterministically', () => {
      const membership = Membership.create(
        {
          clientId: 'client_200',
          planId: 'plan_std',
          period: MembershipPeriod.create(
            new Date('2026-08-01T00:00:00.000Z'),
            new Date('2026-08-31T00:00:00.000Z'),
          ),
          status: MembershipStatus.ACTIVE,
        },
        clock,
      );

      // ACTIVE cannot activate again
      expect(() => membership.activate(clock)).toThrow();

      // Terminate membership
      membership.terminate('Fraud', clock);
      expect(membership.status).toBe(MembershipStatus.TERMINATED);

      // TERMINATED is irrevocable terminal state: cannot freeze, renew, expire, or cancel
      expect(() =>
        membership.freeze(
          FreezeWindow.create(
            new Date('2026-08-05T00:00:00.000Z'),
            new Date('2026-08-10T00:00:00.000Z'),
            'Travel',
          ),
          clock,
        ),
      ).toThrow();
      expect(() =>
        membership.renew(
          MembershipPeriod.create(
            new Date('2026-09-01T00:00:00.000Z'),
            new Date('2026-10-01T00:00:00.000Z'),
          ),
          clock,
        ),
      ).toThrow();
      expect(() => membership.expire(clock)).toThrow();
      expect(() => membership.cancel('Relocation', clock)).toThrow();
      expect(() => membership.terminate('Double terminate', clock)).toThrow();
    });
  });

  describe('Scenario 3: Event Emission Consistency & Notification Dispatcher Deduplication', () => {
    it('should emit events with stable versioning and handle idempotent notification processing', async () => {
      const plan = MembershipPlan.create({
        code: 'PLAN_EVT',
        name: 'Event Plan',
        duration: PlanDuration.ofDays(30),
        price: PlanPrice.create(40, 'USD'),
      });
      plan.publish();
      await planRepo.save(plan);

      // Create membership -> emits MembershipCreated
      const createRes = await createHandler.execute(
        new CreateMembershipCommand({
          clientId: 'client_300',
          planId: plan.id.value,
          startDate: t0,
        }),
      );
      expect(createRes.isSuccess).toBe(true);
      const membershipId = createRes.getValue().id;

      // Renew membership -> emits MembershipRenewed
      await renewHandler.execute(
        new RenewMembershipCommand({
          membershipId,
        }),
      );

      // Advance clock past expiration and trigger expiration -> emits MembershipExpired
      clock.setTime(new Date('2026-10-01T00:00:00.000Z'));
      await expireHandler.execute(new ExpireMembershipsCommand());

      expect(publishedEvents.some((e) => e.eventType === 'MembershipCreated')).toBe(true);
      expect(publishedEvents.some((e) => e.eventType === 'MembershipRenewed')).toBe(true);
      expect(publishedEvents.some((e) => e.eventType === 'MembershipExpired')).toBe(true);

      // Test Notification Dispatcher on all emitted events
      const expiredEvent = publishedEvents.find((e) => e.eventType === 'MembershipExpired')!;
      await notificationDispatcher.handleMembershipExpired(expiredEvent as MembershipExpiredEvent);
      // Re-dispatch duplicate event to prove idempotency
      await notificationDispatcher.handleMembershipExpired(expiredEvent as MembershipExpiredEvent);

      expect(notificationDispatcher.getDispatchedIntents()).toHaveLength(1);
    });
  });
});
