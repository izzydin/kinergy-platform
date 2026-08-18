import { Membership } from './membership.aggregate';
import { MembershipPeriod } from './membership-period.vo';
import { MembershipStatus } from './membership-status.enum';
import { FreezeWindow } from './freeze-window.vo';
import { Clock } from '../shared/clock';
import { MembershipExpiredEvent } from '../events/membership-expired.event';

class TestClock implements Clock {
  constructor(
    private currentTime: Date,
    private readonly tz: string = 'UTC',
  ) {}

  public now(): Date {
    return new Date(this.currentTime.getTime());
  }

  public timezone(): string {
    return this.tz;
  }

  public setTime(date: Date): void {
    this.currentTime = new Date(date.getTime());
  }

  public advanceByMilliseconds(ms: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + ms);
  }

  public advanceByDays(days: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + days * 86400000);
  }
}

describe('Gym Domain: Membership Expiration Temporal Semantics (Phase 5.4-D / ADR-0062)', () => {
  const startUtc = new Date('2026-06-01T00:00:00.000Z');
  const endUtc = new Date('2026-07-01T00:00:00.000Z'); // 30-day half-open period [June 1 -> July 1)
  const clientId = 'client_temporal_qa_999';
  const planId = 'plan_std_30d';

  let clock: TestClock;

  beforeEach(() => {
    clock = new TestClock(new Date('2026-06-15T12:00:00.000Z'));
  });

  describe('1. Mathematical Boundary Evaluation [startDate, endDate)', () => {
    it('should strictly evaluate validity at all key points of the half-open interval', () => {
      const period = MembershipPeriod.create(startUtc, endUtc);

      // 1 millisecond before startDate -> NOT current, NOT expired
      const beforeStart = new Date(startUtc.getTime() - 1);
      expect(period.isCurrent(beforeStart)).toBe(false);
      expect(period.isExpiredAt(beforeStart)).toBe(false);

      // Exactly at startDate -> CURRENT (start-inclusive)
      expect(period.isCurrent(startUtc)).toBe(true);
      expect(period.isExpiredAt(startUtc)).toBe(false);

      // Mid-period -> CURRENT
      const midPeriod = new Date('2026-06-15T12:00:00.000Z');
      expect(period.isCurrent(midPeriod)).toBe(true);
      expect(period.isExpiredAt(midPeriod)).toBe(false);

      // 1 millisecond before endDate -> CURRENT
      const beforeEnd = new Date(endUtc.getTime() - 1);
      expect(period.isCurrent(beforeEnd)).toBe(true);
      expect(period.isExpiredAt(beforeEnd)).toBe(false);

      // Exactly at endDate -> NOT CURRENT (end-exclusive boundary), but contains is true
      expect(period.isCurrent(endUtc)).toBe(false);
      expect(period.contains(endUtc)).toBe(true);
      expect(period.isExpired(endUtc)).toBe(false);

      // 1 millisecond after endDate -> NOT CURRENT, EXPIRED
      const afterEnd = new Date(endUtc.getTime() + 1);
      expect(period.isCurrent(afterEnd)).toBe(false);
      expect(period.contains(afterEnd)).toBe(false);
      expect(period.isExpired(afterEnd)).toBe(true);
    });
  });

  describe('2. Injectable Clock Expiration Progression & Domain Invariants', () => {
    it('should transition to EXPIRED when clock reaches or surpasses endDate', () => {
      const period = MembershipPeriod.create(startUtc, endUtc);
      const membership = Membership.create(
        {
          clientId,
          planId,
          period,
          status: MembershipStatus.ACTIVE,
        },
        clock,
      );
      membership.clearEvents();

      // Advance clock exactly to endDate (July 1, 00:00:00.000Z)
      clock.setTime(endUtc);
      membership.expire(clock);

      expect(membership.status).toBe(MembershipStatus.EXPIRED);
      expect(membership.version).toBe(2);

      const events = membership.getUncommittedEvents();
      expect(events).toHaveLength(1);
      const expiredEvent = events[0] as MembershipExpiredEvent;
      expect(expiredEvent.eventType).toBe('MembershipExpired');
      expect(expiredEvent.payload.membershipId).toBe(membership.id.value);
      expect(expiredEvent.payload.expiredAt).toEqual(endUtc);
    });
  });

  describe('3. Facility Business Timezone Semantics vs UTC Execution', () => {
    it('should correctly anchor business days in local timezone while maintaining UTC precision', () => {
      // Gym located in America/Guayaquil (UTC-5 year-round)
      // Member buys 30 days starting September 1, 2026 local time
      // Local Start: 2026-09-01T00:00:00.000-05:00 -> UTC: 2026-09-01T05:00:00.000Z
      // Local End:   2026-10-01T00:00:00.000-05:00 -> UTC: 2026-10-01T05:00:00.000Z
      const localStartUtc = new Date('2026-09-01T05:00:00.000Z');
      const localEndUtc = new Date('2026-10-01T05:00:00.000Z');
      const period = MembershipPeriod.create(localStartUtc, localEndUtc);

      const guayaquilClock = new TestClock(localStartUtc, 'America/Guayaquil');
      const membership = Membership.create(
        {
          clientId,
          planId,
          period,
          status: MembershipStatus.ACTIVE,
        },
        guayaquilClock,
      );

      // September 30, 23:59:59 local (October 1, 04:59:59.999Z UTC) -> member is current
      const lastSecondLocal = new Date('2026-10-01T04:59:59.999Z');
      guayaquilClock.setTime(lastSecondLocal);
      expect(period.isCurrent(guayaquilClock.now())).toBe(true);
      expect(membership.isEligibleForAttendance(guayaquilClock.now())).toBe(true);

      // October 1, 00:00:00.001 local (October 1, 05:00:00.001Z UTC) -> member is expired
      const pastMidnightLocal = new Date('2026-10-01T05:00:00.001Z');
      guayaquilClock.setTime(pastMidnightLocal);
      expect(period.isCurrent(guayaquilClock.now())).toBe(false);
      expect(period.isExpired(guayaquilClock.now())).toBe(true);
      expect(membership.isEligibleForAttendance(pastMidnightLocal)).toBe(false);
    });
  });

  describe('4. Canonical Attendance Eligibility Predicate (Phase 5.5)', () => {
    it('should strictly evaluate eligibility based on status, period, and freeze history', () => {
      const period = MembershipPeriod.create(startUtc, endUtc);
      const membership = Membership.create(
        {
          clientId,
          planId,
          period,
          status: MembershipStatus.ACTIVE,
        },
        clock,
      );

      // Normal active instant inside period
      expect(membership.isEligibleForAttendance(new Date('2026-06-15T10:00:00.000Z'))).toBe(true);

      // Frozen instant -> Ineligible
      const freeze = FreezeWindow.create(
        new Date('2026-06-10T00:00:00.000Z'),
        new Date('2026-06-20T00:00:00.000Z'),
        'Medical recovery',
      );
      membership.freeze(freeze, clock);
      expect(membership.status).toBe(MembershipStatus.FROZEN);
      expect(membership.isEligibleForAttendance(new Date('2026-06-15T10:00:00.000Z'))).toBe(false);

      // Unfreeze / Resume
      clock.setTime(new Date('2026-06-16T00:00:00.000Z'));
      membership.unfreeze(clock);
      expect(membership.status).toBe(MembershipStatus.ACTIVE);
      expect(membership.isEligibleForAttendance(new Date('2026-06-20T10:00:00.000Z'))).toBe(true);

      // Expired state -> Ineligible (endDate was extended by 10 days during freeze to 2026-07-11)
      clock.setTime(membership.period.endDate);
      membership.expire(clock);
      expect(membership.status).toBe(MembershipStatus.EXPIRED);
      expect(membership.isEligibleForAttendance(clock.now())).toBe(false);
    });
  });
});
