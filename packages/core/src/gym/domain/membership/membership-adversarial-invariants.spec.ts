import { Membership } from './membership.aggregate';
import { MembershipId } from './membership-id.vo';
import { MembershipStatus } from './membership-status.enum';
import { MembershipPeriod } from './membership-period.vo';
import { FreezeWindow } from './freeze-window.vo';
import { TestClock } from '../shared/clock';
import { InvalidMembershipTransitionException } from '../exceptions/invalid-membership-transition.exception';

describe('Membership Aggregate Root — Adversarial & Invariant Hardening (Phase 5.2-F)', () => {
  const baseTime = new Date('2026-08-18T10:00:00.000Z');
  let clock: TestClock;

  beforeEach(() => {
    clock = new TestClock(baseTime);
  });

  function createTestMembership(status: MembershipStatus): Membership {
    return Membership.reconstitute({
      id: MembershipId.create('mem_adv_test'),
      version: 1,
      status,
      clientId: 'client-999',
      planId: 'plan-adv',
      period: MembershipPeriod.create(
        new Date('2026-08-01T00:00:00.000Z'),
        new Date('2026-08-31T00:00:00.000Z'),
      ),
      freezeHistory:
        status === MembershipStatus.FROZEN
          ? [
              FreezeWindow.create(
                new Date('2026-08-10T00:00:00.000Z'),
                new Date('2026-08-20T00:00:00.000Z'),
              ),
            ]
          : [],
      createdAt: baseTime,
      updatedAt: baseTime,
    });
  }

  describe('Attendance Eligibility Invariant', () => {
    it('should grant eligibility ONLY when ACTIVE and within the validity period', () => {
      const activeMembership = createTestMembership(MembershipStatus.ACTIVE);

      // Within validity bounds (2026-08-01 to 2026-08-31)
      expect(activeMembership.isEligibleForAttendance(new Date('2026-08-15T12:00:00.000Z'))).toBe(
        true,
      );
      expect(activeMembership.isEligibleForAttendance(new Date('2026-08-01T00:00:00.000Z'))).toBe(
        true,
      );
      expect(activeMembership.isEligibleForAttendance(new Date('2026-08-31T00:00:00.000Z'))).toBe(
        true,
      );

      // Outside validity bounds
      expect(activeMembership.isEligibleForAttendance(new Date('2026-07-31T23:59:59.000Z'))).toBe(
        false,
      );
      expect(activeMembership.isEligibleForAttendance(new Date('2026-09-01T00:00:00.000Z'))).toBe(
        false,
      );
    });

    it('should deny eligibility across all non-ACTIVE statuses regardless of dates', () => {
      const pending = createTestMembership(MembershipStatus.PENDING);
      const frozen = createTestMembership(MembershipStatus.FROZEN);
      const expired = createTestMembership(MembershipStatus.EXPIRED);
      const cancelled = createTestMembership(MembershipStatus.CANCELLED);
      const terminated = createTestMembership(MembershipStatus.TERMINATED);

      const targetDate = new Date('2026-08-15T12:00:00.000Z');

      expect(pending.isEligibleForAttendance(targetDate)).toBe(false);
      expect(frozen.isEligibleForAttendance(targetDate)).toBe(false);
      expect(expired.isEligibleForAttendance(targetDate)).toBe(false);
      expect(cancelled.isEligibleForAttendance(targetDate)).toBe(false);
      expect(terminated.isEligibleForAttendance(targetDate)).toBe(false);
    });
  });

  describe('Defensive Copying & Encapsulation Integrity', () => {
    it('should prevent external mutation of freezeHistory array', () => {
      const membership = createTestMembership(MembershipStatus.FROZEN);
      const history = membership.freezeHistory;

      // Attempt to mutate the returned array
      (history as FreezeWindow[]).push(
        FreezeWindow.create(
          new Date('2026-08-21T00:00:00.000Z'),
          new Date('2026-08-25T00:00:00.000Z'),
        ),
      );

      expect(membership.freezeHistory.length).toBe(1);
    });

    it('should prevent external mutation of timestamps', () => {
      const membership = createTestMembership(MembershipStatus.ACTIVE);
      const createdAt = membership.createdAt;
      createdAt.setFullYear(2000);

      expect(membership.createdAt.getFullYear()).toBe(2026);
    });
  });

  describe('Multi-Step Operation Sequence & Version Monotonicity', () => {
    it('should increment aggregate version monotonically across an extensive lifecycle trajectory', () => {
      const period = MembershipPeriod.create(
        new Date('2026-09-01T00:00:00.000Z'),
        new Date('2026-10-01T00:00:00.000Z'),
      );

      // Step 1: Create (v1)
      const membership = Membership.create(
        {
          clientId: 'client-trajectory',
          planId: 'plan-basic',
          period,
          status: MembershipStatus.PENDING,
        },
        clock,
      );
      expect(membership.version).toBe(1);

      // Step 2: Activate (v2)
      clock.advanceMinutes(10);
      membership.activate(clock);
      expect(membership.version).toBe(2);

      // Step 3: Freeze (v3)
      clock.advanceMinutes(10);
      membership.freeze(
        FreezeWindow.create(
          new Date('2026-09-05T00:00:00.000Z'),
          new Date('2026-09-15T00:00:00.000Z'),
        ),
        clock,
      );
      expect(membership.version).toBe(3);

      // Step 4: Unfreeze (v4)
      clock.advanceMinutes(10);
      membership.unfreeze(clock);
      expect(membership.version).toBe(4);

      // Step 5: Renew (v5)
      clock.advanceMinutes(10);
      membership.renew(
        MembershipPeriod.create(
          new Date('2026-10-11T00:00:00.000Z'),
          new Date('2026-11-11T00:00:00.000Z'),
        ),
        clock,
      );
      expect(membership.version).toBe(5);

      // Step 6: Expire (v6)
      clock.advanceMinutes(10);
      membership.expire(clock);
      expect(membership.version).toBe(6);

      // Step 7: Renew from Expired (v7)
      clock.advanceMinutes(10);
      membership.renew(
        MembershipPeriod.create(
          new Date('2026-12-01T00:00:00.000Z'),
          new Date('2026-12-31T00:00:00.000Z'),
        ),
        clock,
      );
      expect(membership.version).toBe(7);

      // Step 8: Cancel (v8)
      clock.advanceMinutes(10);
      membership.cancel('Voluntary exit', clock);
      expect(membership.version).toBe(8);

      // Step 9: Terminate (v9)
      clock.advanceMinutes(10);
      membership.terminate('Account archive', clock);
      expect(membership.version).toBe(9);

      // Verify total events emitted matching each mutation
      expect(membership.getUncommittedEvents().length).toBe(9);
    });
  });

  describe('Atomicity & Zero-Event Leakage on Failures', () => {
    it('should retain pristine state and emit NO new events when an operation fails', () => {
      const membership = createTestMembership(MembershipStatus.ACTIVE);
      membership.clearEvents();

      const initialVersion = membership.version;
      const initialPeriod = membership.period;

      // Attempt invalid activation from ACTIVE
      expect(() => membership.activate(clock)).toThrow(InvalidMembershipTransitionException);

      expect(membership.version).toBe(initialVersion);
      expect(membership.period).toEqual(initialPeriod);
      expect(membership.getUncommittedEvents().length).toBe(0);
    });
  });
});
