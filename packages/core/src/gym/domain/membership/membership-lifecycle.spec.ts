import { Membership } from './membership.aggregate';
import { MembershipId } from './membership-id.vo';
import { MembershipStatus } from './membership-status.enum';
import { MembershipPeriod } from './membership-period.vo';
import { FreezeWindow } from './freeze-window.vo';
import { TestClock } from '../shared/clock';
import { InvalidMembershipTransitionException } from '../exceptions/invalid-membership-transition.exception';

describe('Membership Lifecycle State Machine (Phase 5.2-C)', () => {
  const baseTime = new Date('2026-08-18T10:00:00.000Z');
  let clock: TestClock;

  beforeEach(() => {
    clock = new TestClock(baseTime);
  });

  function createTestMembership(initialStatus: MembershipStatus): Membership {
    const period = MembershipPeriod.create(
      new Date('2026-08-01T00:00:00.000Z'),
      new Date('2026-08-31T00:00:00.000Z'),
    );

    return Membership.reconstitute({
      id: MembershipId.create('mem_test'),
      version: 1,
      status: initialStatus,
      clientId: 'client-123',
      planId: 'plan-monthly',
      period,
      freezeHistory:
        initialStatus === MembershipStatus.FROZEN
          ? [
              FreezeWindow.create(
                new Date('2026-08-10T00:00:00.000Z'),
                new Date('2026-08-20T00:00:00.000Z'),
                'Vacation',
              ),
            ]
          : [],
      createdAt: baseTime,
      updatedAt: baseTime,
    });
  }

  describe('1. PENDING State Transitions', () => {
    it('should transition PENDING -> ACTIVE via activate()', () => {
      const membership = createTestMembership(MembershipStatus.PENDING);
      clock.advanceMinutes(5);

      membership.activate(clock);

      expect(membership.status).toBe(MembershipStatus.ACTIVE);
      expect(membership.version).toBe(2);
      expect(membership.updatedAt).toEqual(clock.now());
    });

    it('should transition PENDING -> CANCELLED via cancel()', () => {
      const membership = createTestMembership(MembershipStatus.PENDING);
      membership.cancel('Client requested refund before start', clock);

      expect(membership.status).toBe(MembershipStatus.CANCELLED);
      expect(membership.cancellationReason).toBe('Client requested refund before start');
      expect(membership.version).toBe(2);
    });

    it('should transition PENDING -> TERMINATED via terminate()', () => {
      const membership = createTestMembership(MembershipStatus.PENDING);
      membership.terminate('Identity fraud detected', clock);

      expect(membership.status).toBe(MembershipStatus.TERMINATED);
      expect(membership.terminationReason).toBe('Identity fraud detected');
      expect(membership.version).toBe(2);
    });

    it('should reject invalid transitions from PENDING (freeze, unfreeze, expire, renew)', () => {
      const membership = createTestMembership(MembershipStatus.PENDING);
      const freezeWindow = FreezeWindow.create(
        new Date('2026-08-10T00:00:00.000Z'),
        new Date('2026-08-20T00:00:00.000Z'),
      );
      const renewalPeriod = MembershipPeriod.create(
        new Date('2026-09-01T00:00:00.000Z'),
        new Date('2026-10-01T00:00:00.000Z'),
      );

      expect(() => membership.freeze(freezeWindow, clock)).toThrow(
        InvalidMembershipTransitionException,
      );
      expect(() => membership.unfreeze(clock)).toThrow(InvalidMembershipTransitionException);
      expect(() => membership.expire(clock)).toThrow(InvalidMembershipTransitionException);
      expect(() => membership.renew(renewalPeriod, clock)).toThrow(
        InvalidMembershipTransitionException,
      );
    });
  });

  describe('2. ACTIVE State Transitions', () => {
    it('should transition ACTIVE -> FROZEN via freeze()', () => {
      const membership = createTestMembership(MembershipStatus.ACTIVE);
      const freezeWindow = FreezeWindow.create(
        new Date('2026-08-10T00:00:00.000Z'),
        new Date('2026-08-20T00:00:00.000Z'),
        'Medical hold',
      );

      membership.freeze(freezeWindow, clock);

      expect(membership.status).toBe(MembershipStatus.FROZEN);
      expect(membership.freezeHistory.length).toBe(1);
      expect(membership.freezeHistory[0]?.reason).toBe('Medical hold');
      expect(membership.version).toBe(2);
    });

    it('should transition ACTIVE -> EXPIRED via expire()', () => {
      const membership = createTestMembership(MembershipStatus.ACTIVE);
      membership.expire(clock);

      expect(membership.status).toBe(MembershipStatus.EXPIRED);
      expect(membership.version).toBe(2);
    });

    it('should perform gapless period extension on ACTIVE -> ACTIVE via renew()', () => {
      const membership = createTestMembership(MembershipStatus.ACTIVE);
      const initialEnd = membership.period.endDate;
      const additionalPeriod = MembershipPeriod.create(
        new Date('2026-09-01T00:00:00.000Z'),
        new Date('2026-10-01T00:00:00.000Z'),
      ); // 30 days

      membership.renew(additionalPeriod, clock);

      expect(membership.status).toBe(MembershipStatus.ACTIVE);
      expect(membership.version).toBe(2);
      expect(membership.period.endDate.getTime()).toBe(
        initialEnd.getTime() + additionalPeriod.durationDays * 24 * 60 * 60 * 1000,
      );
    });

    it('should transition ACTIVE -> CANCELLED via cancel()', () => {
      const membership = createTestMembership(MembershipStatus.ACTIVE);
      membership.cancel('Relocating to another city', clock);

      expect(membership.status).toBe(MembershipStatus.CANCELLED);
      expect(membership.cancellationReason).toBe('Relocating to another city');
      expect(membership.version).toBe(2);
    });

    it('should transition ACTIVE -> TERMINATED via terminate()', () => {
      const membership = createTestMembership(MembershipStatus.ACTIVE);
      membership.terminate('Facility code of conduct violation', clock);

      expect(membership.status).toBe(MembershipStatus.TERMINATED);
      expect(membership.terminationReason).toBe('Facility code of conduct violation');
      expect(membership.version).toBe(2);
    });

    it('should reject invalid transitions from ACTIVE (activate, unfreeze)', () => {
      const membership = createTestMembership(MembershipStatus.ACTIVE);

      expect(() => membership.activate(clock)).toThrow(InvalidMembershipTransitionException);
      expect(() => membership.unfreeze(clock)).toThrow(InvalidMembershipTransitionException);
    });
  });

  describe('3. FROZEN State Transitions & Extension Math', () => {
    it('should transition FROZEN -> ACTIVE via unfreeze() and extend endDate by freeze duration', () => {
      const membership = createTestMembership(MembershipStatus.FROZEN);
      const previousEnd = membership.period.endDate; // 2026-08-31
      // Freeze window is 2026-08-10 to 2026-08-20 = 10 days

      membership.unfreeze(clock);

      expect(membership.status).toBe(MembershipStatus.ACTIVE);
      expect(membership.version).toBe(2);
      const expectedEnd = new Date(previousEnd.getTime() + 10 * 24 * 60 * 60 * 1000);
      expect(membership.period.endDate).toEqual(expectedEnd);
    });

    it('should transition FROZEN -> EXPIRED via expire()', () => {
      const membership = createTestMembership(MembershipStatus.FROZEN);
      membership.expire(clock);

      expect(membership.status).toBe(MembershipStatus.EXPIRED);
      expect(membership.version).toBe(2);
    });

    it('should transition FROZEN -> CANCELLED via cancel()', () => {
      const membership = createTestMembership(MembershipStatus.FROZEN);
      membership.cancel('Cancelled while on freeze', clock);

      expect(membership.status).toBe(MembershipStatus.CANCELLED);
      expect(membership.version).toBe(2);
    });

    it('should transition FROZEN -> TERMINATED via terminate()', () => {
      const membership = createTestMembership(MembershipStatus.FROZEN);
      membership.terminate('Account purged', clock);

      expect(membership.status).toBe(MembershipStatus.TERMINATED);
      expect(membership.version).toBe(2);
    });

    it('should reject invalid transitions from FROZEN (activate, freeze, renew)', () => {
      const membership = createTestMembership(MembershipStatus.FROZEN);
      const freeze = FreezeWindow.create(
        new Date('2026-08-21T00:00:00.000Z'),
        new Date('2026-08-25T00:00:00.000Z'),
      );
      const renewalPeriod = MembershipPeriod.create(
        new Date('2026-09-01T00:00:00.000Z'),
        new Date('2026-10-01T00:00:00.000Z'),
      );

      expect(() => membership.activate(clock)).toThrow(InvalidMembershipTransitionException);
      expect(() => membership.freeze(freeze, clock)).toThrow(InvalidMembershipTransitionException);
      expect(() => membership.renew(renewalPeriod, clock)).toThrow(
        InvalidMembershipTransitionException,
      );
    });
  });

  describe('4. EXPIRED State Transitions', () => {
    it('should re-activate membership upon payment via renew()', () => {
      const membership = createTestMembership(MembershipStatus.EXPIRED);
      const newPeriod = MembershipPeriod.create(
        new Date('2026-09-01T00:00:00.000Z'),
        new Date('2026-10-01T00:00:00.000Z'),
      );

      membership.renew(newPeriod, clock);

      expect(membership.status).toBe(MembershipStatus.ACTIVE);
      expect(membership.period.equals(newPeriod)).toBe(true);
      expect(membership.version).toBe(2);
    });

    it('should transition EXPIRED -> TERMINATED via terminate()', () => {
      const membership = createTestMembership(MembershipStatus.EXPIRED);
      membership.terminate('Long-term inactive purge', clock);

      expect(membership.status).toBe(MembershipStatus.TERMINATED);
      expect(membership.version).toBe(2);
    });

    it('should reject invalid transitions from EXPIRED (activate, freeze, unfreeze, expire, cancel)', () => {
      const membership = createTestMembership(MembershipStatus.EXPIRED);
      const freeze = FreezeWindow.create(
        new Date('2026-08-10T00:00:00.000Z'),
        new Date('2026-08-20T00:00:00.000Z'),
      );

      expect(() => membership.activate(clock)).toThrow(InvalidMembershipTransitionException);
      expect(() => membership.freeze(freeze, clock)).toThrow(InvalidMembershipTransitionException);
      expect(() => membership.unfreeze(clock)).toThrow(InvalidMembershipTransitionException);
      expect(() => membership.expire(clock)).toThrow(InvalidMembershipTransitionException);
      expect(() => membership.cancel('Cannot cancel expired pass', clock)).toThrow(
        InvalidMembershipTransitionException,
      );
    });
  });

  describe('5. CANCELLED & TERMINATED State Transitions', () => {
    it('should allow CANCELLED -> TERMINATED via terminate()', () => {
      const membership = createTestMembership(MembershipStatus.CANCELLED);
      membership.terminate('Final purge', clock);

      expect(membership.status).toBe(MembershipStatus.TERMINATED);
      expect(membership.version).toBe(2);
    });

    it('should reject all operational transitions from CANCELLED (activate, freeze, unfreeze, expire, renew, cancel)', () => {
      const membership = createTestMembership(MembershipStatus.CANCELLED);
      const freeze = FreezeWindow.create(
        new Date('2026-08-10T00:00:00.000Z'),
        new Date('2026-08-20T00:00:00.000Z'),
      );
      const renewalPeriod = MembershipPeriod.create(
        new Date('2026-09-01T00:00:00.000Z'),
        new Date('2026-10-01T00:00:00.000Z'),
      );

      expect(() => membership.activate(clock)).toThrow(InvalidMembershipTransitionException);
      expect(() => membership.freeze(freeze, clock)).toThrow(InvalidMembershipTransitionException);
      expect(() => membership.unfreeze(clock)).toThrow(InvalidMembershipTransitionException);
      expect(() => membership.expire(clock)).toThrow(InvalidMembershipTransitionException);
      expect(() => membership.renew(renewalPeriod, clock)).toThrow(
        InvalidMembershipTransitionException,
      );
      expect(() => membership.cancel('Already cancelled', clock)).toThrow(
        InvalidMembershipTransitionException,
      );
    });

    it('should reject ALL transitions from TERMINATED (terminal state)', () => {
      const membership = createTestMembership(MembershipStatus.TERMINATED);
      const freeze = FreezeWindow.create(
        new Date('2026-08-10T00:00:00.000Z'),
        new Date('2026-08-20T00:00:00.000Z'),
      );
      const renewalPeriod = MembershipPeriod.create(
        new Date('2026-09-01T00:00:00.000Z'),
        new Date('2026-10-01T00:00:00.000Z'),
      );

      expect(() => membership.activate(clock)).toThrow(InvalidMembershipTransitionException);
      expect(() => membership.freeze(freeze, clock)).toThrow(InvalidMembershipTransitionException);
      expect(() => membership.unfreeze(clock)).toThrow(InvalidMembershipTransitionException);
      expect(() => membership.expire(clock)).toThrow(InvalidMembershipTransitionException);
      expect(() => membership.renew(renewalPeriod, clock)).toThrow(
        InvalidMembershipTransitionException,
      );
      expect(() => membership.cancel('Cannot cancel terminated', clock)).toThrow(
        InvalidMembershipTransitionException,
      );
      expect(() => membership.terminate('Already terminated', clock)).toThrow(
        InvalidMembershipTransitionException,
      );
    });
  });
});
