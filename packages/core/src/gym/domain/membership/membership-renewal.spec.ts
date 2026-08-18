import { Membership } from './membership.aggregate';
import { MembershipPeriod } from './membership-period.vo';
import { MembershipStatus } from './membership-status.enum';
import { FreezeWindow } from './freeze-window.vo';
import { Clock } from '../shared/clock';
import { InvalidMembershipTransitionException } from '../exceptions/invalid-membership-transition.exception';
import { MembershipRenewedEvent } from '../events';

class TestClock implements Clock {
  constructor(private currentTime: Date) {}
  public now(): Date {
    return new Date(this.currentTime.getTime());
  }
  public timezone(): string {
    return 'UTC';
  }
  public advanceTo(date: Date): void {
    this.currentTime = new Date(date.getTime());
  }
  public advanceByDays(days: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + days * 24 * 60 * 60 * 1000);
  }
}

describe('Gym Domain: Membership Renewal & Expiration Behavior (Phase 5.4-B)', () => {
  const baseStart = new Date('2026-06-01T00:00:00.000Z');
  const baseEnd = new Date('2026-07-01T00:00:00.000Z'); // 30 days
  const clientId = 'client_renewal_test_123';
  const initialPlanId = 'plan_gold_30d';

  let clock: TestClock;

  beforeEach(() => {
    clock = new TestClock(new Date('2026-06-15T12:00:00.000Z'));
  });

  describe('1. Early Renewal (now < endDate)', () => {
    it('should preserve 100% of unused time by extending gaplessly from current endDate', () => {
      const initialPeriod = MembershipPeriod.create(baseStart, baseEnd);
      const membership = Membership.create(
        {
          clientId,
          planId: initialPlanId,
          period: initialPeriod,
          status: MembershipStatus.ACTIVE,
        },
        clock,
      );

      membership.clearUncommittedEvents();
      expect(membership.version).toBe(1);

      // Member renews on June 20 (11 days before July 1 expiration) for another 30 days
      clock.advanceTo(new Date('2026-06-20T10:00:00.000Z'));
      const renewalPeriod = MembershipPeriod.create(
        new Date('2026-07-01T00:00:00.000Z'),
        new Date('2026-07-31T00:00:00.000Z'),
      );

      membership.renew(renewalPeriod, clock);

      expect(membership.status).toBe(MembershipStatus.ACTIVE);
      expect(membership.version).toBe(2);
      expect(membership.period.startDate).toEqual(baseStart);
      expect(membership.period.endDate).toEqual(new Date('2026-07-31T00:00:00.000Z'));
      expect(membership.period.durationDays).toBe(60);

      // Verify domain event
      const events = membership.getUncommittedEvents();
      expect(events).toHaveLength(1);
      const renewEvent = events[0] as MembershipRenewedEvent;
      expect(renewEvent.eventType).toBe('MembershipRenewed');
      expect(renewEvent.payload.newStartDate).toEqual(baseStart);
      expect(renewEvent.payload.newEndDate).toEqual(new Date('2026-07-31T00:00:00.000Z'));
      expect(renewEvent.payload.renewedAt).toEqual(clock.now());
    });
  });

  describe('2. Exact Expiration Boundary Renewal (now == endDate)', () => {
    it('should extend seamlessly when renewed exactly at the expiration instant', () => {
      const initialPeriod = MembershipPeriod.create(baseStart, baseEnd);
      const membership = Membership.create(
        {
          clientId,
          planId: initialPlanId,
          period: initialPeriod,
          status: MembershipStatus.ACTIVE,
        },
        clock,
      );

      // Advance clock exactly to July 1, 00:00:00.000Z
      clock.advanceTo(baseEnd);
      // At exact boundary instant, period is not current by half-open [startDate, endDate) rule
      expect(membership.period.isCurrent(clock.now())).toBe(false);
      expect(membership.isEligibleForAttendance(clock.now())).toBe(true);

      const renewalPeriod = MembershipPeriod.create(
        baseEnd,
        new Date('2026-07-31T00:00:00.000Z'), // 30 days
      );

      membership.renew(renewalPeriod, clock);

      expect(membership.status).toBe(MembershipStatus.ACTIVE);
      expect(membership.period.endDate).toEqual(new Date('2026-07-31T00:00:00.000Z'));
      // After renewal, is eligible again at the current instant
      expect(membership.isEligibleForAttendance(clock.now())).toBe(true);
    });
  });

  describe('3. Post-Expiration Renewal (now > endDate)', () => {
    it('should re-activate an EXPIRED membership starting from the effective renewal date without gap fees', () => {
      const initialPeriod = MembershipPeriod.create(baseStart, baseEnd);
      const membership = Membership.create(
        {
          clientId,
          planId: initialPlanId,
          period: initialPeriod,
          status: MembershipStatus.ACTIVE,
        },
        clock,
      );

      // Lapsed: Advance to July 10
      clock.advanceTo(new Date('2026-07-10T10:00:00.000Z'));
      membership.expire(clock);
      membership.clearUncommittedEvents();
      expect(membership.status).toBe(MembershipStatus.EXPIRED);

      // Renew for 30 days starting July 10
      const newStart = new Date('2026-07-10T00:00:00.000Z');
      const newEnd = new Date('2026-08-09T00:00:00.000Z');
      const renewalPeriod = MembershipPeriod.create(newStart, newEnd);

      membership.renew(renewalPeriod, clock);

      expect(membership.status).toBe(MembershipStatus.ACTIVE);
      expect(membership.period.startDate).toEqual(newStart);
      expect(membership.period.endDate).toEqual(newEnd);
      expect(membership.period.durationDays).toBe(30);

      const events = membership.getUncommittedEvents();
      expect(events).toHaveLength(1);
      const event = events[0] as MembershipRenewedEvent;
      expect(event.payload.newStartDate).toEqual(newStart);
      expect(event.payload.newEndDate).toEqual(newEnd);
    });

    it('should handle late renewal when status is ACTIVE but clock has passed endDate', () => {
      const initialPeriod = MembershipPeriod.create(baseStart, baseEnd);
      const membership = Membership.create(
        {
          clientId,
          planId: initialPlanId,
          period: initialPeriod,
          status: MembershipStatus.ACTIVE,
        },
        clock,
      );

      // Advance clock past endDate without running expire batch job
      clock.advanceTo(new Date('2026-07-05T14:00:00.000Z'));
      expect(membership.status).toBe(MembershipStatus.ACTIVE);

      const newStart = new Date('2026-07-05T00:00:00.000Z');
      const newEnd = new Date('2026-08-04T00:00:00.000Z');
      const renewalPeriod = MembershipPeriod.create(newStart, newEnd);

      membership.renew(renewalPeriod, clock);

      expect(membership.status).toBe(MembershipStatus.ACTIVE);
      expect(membership.period.startDate).toEqual(newStart);
      expect(membership.period.endDate).toEqual(newEnd);
    });
  });

  describe('4. Forbidden Renewal from Non-Renewable States (FROZEN, PENDING, CANCELLED, TERMINATED)', () => {
    it('should reject renewal while FROZEN (must be unfrozen first)', () => {
      const initialPeriod = MembershipPeriod.create(baseStart, baseEnd);
      const membership = Membership.create(
        {
          clientId,
          planId: initialPlanId,
          period: initialPeriod,
          status: MembershipStatus.ACTIVE,
        },
        clock,
      );

      const freezeWindow = FreezeWindow.create(
        new Date('2026-06-10T00:00:00.000Z'),
        new Date('2026-06-25T00:00:00.000Z'),
        'Medical recovery',
      );
      membership.freeze(freezeWindow, clock);
      expect(membership.status).toBe(MembershipStatus.FROZEN);

      const renewalPeriod = MembershipPeriod.create(baseEnd, new Date('2026-07-31T00:00:00.000Z'));

      expect(() => membership.renew(renewalPeriod, clock)).toThrow(
        InvalidMembershipTransitionException,
      );
    });

    it('should reject renewal while PENDING (must be activated first)', () => {
      const futureStart = new Date('2026-09-01T00:00:00.000Z');
      const futureEnd = new Date('2026-10-01T00:00:00.000Z');
      const pendingPeriod = MembershipPeriod.create(futureStart, futureEnd);

      const membership = Membership.create(
        {
          clientId,
          planId: initialPlanId,
          period: pendingPeriod,
          status: MembershipStatus.PENDING,
        },
        clock,
      );

      expect(membership.status).toBe(MembershipStatus.PENDING);

      const additionalPeriod = MembershipPeriod.create(
        futureEnd,
        new Date('2026-10-31T00:00:00.000Z'),
      );

      expect(() => membership.renew(additionalPeriod, clock)).toThrow(
        InvalidMembershipTransitionException,
      );
    });
  });

  describe('5. Prohibited Renewal from Terminal States (CANCELLED & TERMINATED)', () => {
    it('should throw InvalidMembershipTransitionException when attempting to renew a CANCELLED membership', () => {
      const initialPeriod = MembershipPeriod.create(baseStart, baseEnd);
      const membership = Membership.create(
        {
          clientId,
          planId: initialPlanId,
          period: initialPeriod,
          status: MembershipStatus.ACTIVE,
        },
        clock,
      );

      membership.cancel('Moved to another city', clock);
      expect(membership.status).toBe(MembershipStatus.CANCELLED);
      membership.clearUncommittedEvents();

      const renewalPeriod = MembershipPeriod.create(baseEnd, new Date('2026-07-31T00:00:00.000Z'));

      expect(() => membership.renew(renewalPeriod, clock)).toThrow(
        InvalidMembershipTransitionException,
      );
      expect(membership.getUncommittedEvents()).toHaveLength(0);
    });

    it('should throw InvalidMembershipTransitionException when attempting to renew a TERMINATED membership', () => {
      const initialPeriod = MembershipPeriod.create(baseStart, baseEnd);
      const membership = Membership.create(
        {
          clientId,
          planId: initialPlanId,
          period: initialPeriod,
          status: MembershipStatus.ACTIVE,
        },
        clock,
      );

      membership.terminate('Severe facility code violation', clock);
      expect(membership.status).toBe(MembershipStatus.TERMINATED);
      membership.clearUncommittedEvents();

      const renewalPeriod = MembershipPeriod.create(baseEnd, new Date('2026-07-31T00:00:00.000Z'));

      expect(() => membership.renew(renewalPeriod, clock)).toThrow(
        InvalidMembershipTransitionException,
      );
      expect(membership.getUncommittedEvents()).toHaveLength(0);
    });
  });

  describe('6. Renewal With Plan Change', () => {
    it('should update planId to newPlanId when renewing on upgraded commercial tier', () => {
      const initialPeriod = MembershipPeriod.create(baseStart, baseEnd);
      const membership = Membership.create(
        {
          clientId,
          planId: initialPlanId,
          period: initialPeriod,
          status: MembershipStatus.ACTIVE,
        },
        clock,
      );

      const newPlanId = 'plan_platinum_annual_365d';
      const renewalPeriod = MembershipPeriod.create(baseEnd, new Date('2027-07-01T00:00:00.000Z'));

      membership.renew(renewalPeriod, clock, newPlanId);

      expect(membership.planId).toBe(newPlanId);
      const event = membership.getUncommittedEvents()[1] as MembershipRenewedEvent;
      expect(event.payload.planId).toBe(newPlanId);
    });
  });

  describe('7. Attendance Eligibility Contract Verification', () => {
    it('should strictly evaluate attendance eligibility according to half-open interval and freeze status', () => {
      const initialPeriod = MembershipPeriod.create(baseStart, baseEnd);
      const membership = Membership.create(
        {
          clientId,
          planId: initialPlanId,
          period: initialPeriod,
          status: MembershipStatus.ACTIVE,
        },
        clock,
      );

      // Valid active instant
      expect(membership.isEligibleForAttendance(new Date('2026-06-15T12:00:00.000Z'))).toBe(true);

      // Start date exact match (inclusive)
      expect(membership.isEligibleForAttendance(baseStart)).toBe(true);

      // End date exact match (inclusive on contains, exclusive on isCurrent)
      expect(membership.isEligibleForAttendance(baseEnd)).toBe(true);
      expect(membership.period.isCurrent(baseEnd)).toBe(false);

      // Outside period
      expect(membership.isEligibleForAttendance(new Date('2026-05-31T23:59:59.999Z'))).toBe(false);
      expect(membership.isEligibleForAttendance(new Date('2026-07-01T00:00:00.001Z'))).toBe(false);

      // Frozen state -> denied
      const freezeWindow = FreezeWindow.create(
        new Date('2026-06-10T00:00:00.000Z'),
        new Date('2026-06-20T00:00:00.000Z'),
        'Vacation',
      );
      membership.freeze(freezeWindow, clock);
      expect(membership.isEligibleForAttendance(new Date('2026-06-15T12:00:00.000Z'))).toBe(false);
    });
  });
});
