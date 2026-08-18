import { MembershipPlan } from './membership-plan.aggregate';
import { PlanPrice } from './plan-price.vo';
import { PlanStatus } from './plan-status.enum';
import { Membership } from '../membership/membership.aggregate';
import { MembershipPeriod } from '../membership/membership-period.vo';
import { MembershipStatus } from '../membership/membership-status.enum';
import { FreezeWindow } from '../membership/freeze-window.vo';
import { TestClock } from '../shared/clock';
import {
  MembershipPlanCreatedEvent,
  MembershipPlanPublishedEvent,
  MembershipPlanPriceChangedEvent,
  MembershipPlanArchivedEvent,
} from '../events';
import { InvalidPlanTransitionException } from '../exceptions/invalid-plan-transition.exception';

describe('MembershipPlan Lifecycle, Domain Events & Historical Integrity (Phase 5.3-C)', () => {
  const startDate = new Date('2026-06-01T00:00:00.000Z');

  describe('1. Commercial Decoupling & Historical Integrity Invariant', () => {
    it('should prove updating plan price does NOT mutate active existing Membership agreements', () => {
      const clock = new TestClock(startDate);

      // 1. Setup commercial plan
      const plan = MembershipPlan.create(
        {
          code: 'MONTHLY_BASIC',
          name: 'Basic Monthly',
          duration: 30,
          price: { amount: 50.0, currency: 'USD' },
        },
        startDate,
      );
      plan.publish(startDate);

      // 2. Client purchases membership under current plan terms ($50, 30 days)
      const period = MembershipPeriod.create(startDate, plan.duration.calculateEndDate(startDate));
      const membership = Membership.create({
        clientId: 'client_100',
        planId: plan.id.value,
        period,
        status: MembershipStatus.PENDING,
      });
      membership.activate(clock);

      expect(membership.status).toBe(MembershipStatus.ACTIVE);
      expect(membership.planId).toBe(plan.id.value);
      expect(membership.period.durationDays).toBe(30);
      expect(membership.isEligibleForAttendance(startDate)).toBe(true);

      // 3. Facility later increases plan price to $75.00
      const priceUpdateDate = new Date('2026-06-10T12:00:00.000Z');
      plan.updatePricing(PlanPrice.create(75.0, 'USD'), priceUpdateDate);

      // 4. Verify existing membership contract remains completely uncorrupted
      expect(membership.status).toBe(MembershipStatus.ACTIVE);
      expect(membership.period.startDate.toISOString()).toBe(startDate.toISOString());
      expect(membership.period.durationDays).toBe(30);
      expect(membership.isEligibleForAttendance(priceUpdateDate)).toBe(true);
    });

    it('should prove archiving a plan does NOT cancel, expire, or lock existing active Memberships', () => {
      const clock = new TestClock(startDate);

      // 1. Create and publish plan
      const plan = MembershipPlan.create(
        {
          code: 'VIP_SUMMER',
          name: 'Summer VIP',
          duration: 90,
          price: { amount: 120.0, currency: 'USD' },
        },
        startDate,
      );
      plan.publish(startDate);

      // 2. Create and activate customer membership
      const period = MembershipPeriod.create(startDate, plan.duration.calculateEndDate(startDate));
      const membership = Membership.create({
        clientId: 'client_200',
        planId: plan.id.value,
        period,
        status: MembershipStatus.PENDING,
      });
      membership.activate(clock);

      // 3. Summer season ends -> Plan is retired / ARCHIVED
      const archiveDate = new Date('2026-07-01T00:00:00.000Z');
      plan.archive(archiveDate);

      expect(plan.status).toBe(PlanStatus.ARCHIVED);
      expect(plan.isAvailableForPurchase()).toBe(false);

      // 4. Verify existing member can continue using facility, freeze, and unfreeze without issue
      expect(membership.status).toBe(MembershipStatus.ACTIVE);
      expect(membership.isEligibleForAttendance(new Date('2026-07-15T10:00:00.000Z'))).toBe(true);

      // Member requests a 10-day freeze
      clock.advanceDays(45); // July 16
      const freezeWindow = FreezeWindow.create(
        new Date('2026-07-16T00:00:00.000Z'),
        new Date('2026-07-26T00:00:00.000Z'),
        'Vacation',
      );
      membership.freeze(freezeWindow, clock);
      expect(membership.status).toBe(MembershipStatus.FROZEN);

      // Member unfreezes -> period is extended gaplessly
      clock.advanceDays(10); // July 26
      membership.unfreeze(clock);
      expect(membership.status).toBe(MembershipStatus.ACTIVE);
      expect(membership.period.durationDays).toBe(100); // 90 + 10 days
    });
  });

  describe('2. Plan Domain Event Recording & Atomicity', () => {
    it('should record MembershipPlanCreatedEvent upon creation', () => {
      const plan = MembershipPlan.create({
        code: 'TRIAL_7D',
        name: '7-Day Trial',
        duration: 7,
        price: { amount: 0.0, currency: 'USD' },
      });

      const events = plan.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(MembershipPlanCreatedEvent);

      const createdEvent = events[0] as MembershipPlanCreatedEvent;
      expect(createdEvent.eventType).toBe('MembershipPlanCreated');
      expect(createdEvent.aggregateId).toBe(plan.id.value);
      expect(createdEvent.payload.code).toBe('TRIAL_7D');
      expect(createdEvent.payload.durationInDays).toBe(7);
      expect(createdEvent.payload.priceAmount).toBe(0.0);
    });

    it('should record MembershipPlanPublishedEvent and clear events', () => {
      const plan = MembershipPlan.create({
        code: 'STD_30D',
        name: 'Standard 30 Days',
        duration: 30,
        price: { amount: 45.0, currency: 'USD' },
      });
      plan.clearEvents();

      plan.publish();

      const events = plan.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(MembershipPlanPublishedEvent);
      expect(events[0]?.eventType).toBe('MembershipPlanPublished');
      expect((events[0] as MembershipPlanPublishedEvent).payload.code).toBe('STD_30D');
    });

    it('should record MembershipPlanPriceChangedEvent on price update', () => {
      const plan = MembershipPlan.create({
        code: 'STD_30D',
        name: 'Standard 30 Days',
        duration: 30,
        price: { amount: 45.0, currency: 'USD' },
      });
      plan.clearEvents();

      plan.updatePricing(PlanPrice.create(50.0, 'USD'));

      const events = plan.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(MembershipPlanPriceChangedEvent);

      const priceEvent = events[0] as MembershipPlanPriceChangedEvent;
      expect(priceEvent.payload.previousAmount).toBe(45.0);
      expect(priceEvent.payload.newAmount).toBe(50.0);
    });

    it('should record MembershipPlanArchivedEvent when archived', () => {
      const plan = MembershipPlan.create({
        code: 'STD_30D',
        name: 'Standard 30 Days',
        duration: 30,
        price: { amount: 45.0, currency: 'USD' },
      });
      plan.clearEvents();

      plan.archive();

      const events = plan.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(MembershipPlanArchivedEvent);
      expect(events[0]?.eventType).toBe('MembershipPlanArchived');
    });

    it('should record zero uncommitted events when operation fails', () => {
      const plan = MembershipPlan.create({
        code: 'STD_30D',
        name: 'Standard 30 Days',
        duration: 30,
        price: { amount: 45.0, currency: 'USD' },
      });
      plan.archive();
      plan.clearEvents();

      expect(() => plan.publish()).toThrow(InvalidPlanTransitionException);
      expect(plan.getUncommittedEvents()).toHaveLength(0);
    });
  });
});
