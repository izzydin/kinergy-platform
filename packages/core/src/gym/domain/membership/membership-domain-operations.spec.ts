import { Membership } from './membership.aggregate';
import { MembershipId } from './membership-id.vo';
import { MembershipStatus } from './membership-status.enum';
import { MembershipPeriod } from './membership-period.vo';
import { FreezeWindow } from './freeze-window.vo';
import { TestClock } from '../shared/clock';
import { InvalidMembershipTransitionException } from '../exceptions/invalid-membership-transition.exception';

describe('Membership Aggregate Root — Domain Operations (Phase 5.2-D)', () => {
  const baseTime = new Date('2026-08-18T10:00:00.000Z');
  let clock: TestClock;

  beforeEach(() => {
    clock = new TestClock(baseTime);
  });

  function createMembershipWithStatus(
    status: MembershipStatus,
    startDateStr: string = '2026-08-01T00:00:00.000Z',
    endDateStr: string = '2026-08-31T00:00:00.000Z',
  ): Membership {
    const period = MembershipPeriod.create(new Date(startDateStr), new Date(endDateStr));
    return Membership.reconstitute({
      id: MembershipId.create('mem_op_test'),
      version: 1,
      status,
      clientId: 'client-500',
      planId: 'plan-basic-monthly',
      period,
      freezeHistory:
        status === MembershipStatus.FROZEN
          ? [
              FreezeWindow.create(
                new Date('2026-08-05T00:00:00.000Z'),
                new Date('2026-08-15T00:00:00.000Z'),
                'Annual vacation',
              ),
            ]
          : [],
      createdAt: baseTime,
      updatedAt: baseTime,
    });
  }

  describe('Operation: activate', () => {
    it('should successfully activate a PENDING membership and increment aggregate version', () => {
      const membership = createMembershipWithStatus(MembershipStatus.PENDING);
      clock.advanceMinutes(15);

      membership.activate(clock);

      expect(membership.isActive()).toBe(true);
      expect(membership.status).toBe(MembershipStatus.ACTIVE);
      expect(membership.version).toBe(2);
      expect(membership.updatedAt).toEqual(clock.now());
    });

    it('should reject activation if membership is not in PENDING status', () => {
      const activeMembership = createMembershipWithStatus(MembershipStatus.ACTIVE);
      expect(() => activeMembership.activate(clock)).toThrow(InvalidMembershipTransitionException);

      const expiredMembership = createMembershipWithStatus(MembershipStatus.EXPIRED);
      expect(() => expiredMembership.activate(clock)).toThrow(InvalidMembershipTransitionException);
    });
  });

  describe('Operation: freeze and unfreeze', () => {
    it('should freeze an ACTIVE membership, recording the freeze window in history', () => {
      const membership = createMembershipWithStatus(MembershipStatus.ACTIVE);
      const freeze = FreezeWindow.create(
        new Date('2026-08-10T00:00:00.000Z'),
        new Date('2026-08-20T00:00:00.000Z'),
        'Temporary travel',
      );

      membership.freeze(freeze, clock);

      expect(membership.isFrozen()).toBe(true);
      expect(membership.freezeHistory.length).toBe(1);
      expect(membership.freezeHistory[0]?.durationDays).toBe(10);
      expect(membership.version).toBe(2);
    });

    it('should unfreeze a FROZEN membership, extending the end date by the exact freeze duration', () => {
      const membership = createMembershipWithStatus(
        MembershipStatus.FROZEN,
        '2026-08-01T00:00:00.000Z',
        '2026-08-31T00:00:00.000Z',
      );
      // Freeze window is 10 days (2026-08-05 to 2026-08-15)

      membership.unfreeze(clock);

      expect(membership.isActive()).toBe(true);
      expect(membership.period.endDate).toEqual(new Date('2026-09-10T00:00:00.000Z'));
      expect(membership.version).toBe(2);
    });

    it('should reject freezing if membership is not ACTIVE', () => {
      const pendingMembership = createMembershipWithStatus(MembershipStatus.PENDING);
      const freeze = FreezeWindow.create(
        new Date('2026-08-10T00:00:00.000Z'),
        new Date('2026-08-20T00:00:00.000Z'),
      );

      expect(() => pendingMembership.freeze(freeze, clock)).toThrow(
        InvalidMembershipTransitionException,
      );
    });
  });

  describe('Operation: expire', () => {
    it('should expire an ACTIVE membership when validity period ends', () => {
      const membership = createMembershipWithStatus(MembershipStatus.ACTIVE);

      membership.expire(clock);

      expect(membership.isExpired()).toBe(true);
      expect(membership.version).toBe(2);
    });

    it('should expire a FROZEN membership when max term is exceeded', () => {
      const membership = createMembershipWithStatus(MembershipStatus.FROZEN);

      membership.expire(clock);

      expect(membership.isExpired()).toBe(true);
      expect(membership.version).toBe(2);
    });
  });

  describe('Operation: renew', () => {
    it('should perform gapless validity extension when renewing an ACTIVE membership', () => {
      const membership = createMembershipWithStatus(
        MembershipStatus.ACTIVE,
        '2026-08-01T00:00:00.000Z',
        '2026-08-31T00:00:00.000Z',
      );
      const renewalTerm = MembershipPeriod.create(
        new Date('2026-09-01T00:00:00.000Z'),
        new Date('2026-10-01T00:00:00.000Z'),
      ); // 30 days

      membership.renew(renewalTerm, clock);

      expect(membership.isActive()).toBe(true);
      expect(membership.period.startDate).toEqual(new Date('2026-08-01T00:00:00.000Z'));
      expect(membership.period.endDate).toEqual(new Date('2026-09-30T00:00:00.000Z'));
      expect(membership.version).toBe(2);
    });

    it('should re-activate an EXPIRED membership and establish the new validity period', () => {
      const membership = createMembershipWithStatus(
        MembershipStatus.EXPIRED,
        '2026-07-01T00:00:00.000Z',
        '2026-07-31T00:00:00.000Z',
      );
      const newTerm = MembershipPeriod.create(
        new Date('2026-08-18T00:00:00.000Z'),
        new Date('2026-09-18T00:00:00.000Z'),
      );

      membership.renew(newTerm, clock);

      expect(membership.isActive()).toBe(true);
      expect(membership.period.equals(newTerm)).toBe(true);
      expect(membership.version).toBe(2);
    });

    it('should reject renewal when membership is CANCELLED or TERMINATED', () => {
      const cancelledMembership = createMembershipWithStatus(MembershipStatus.CANCELLED);
      const newTerm = MembershipPeriod.create(
        new Date('2026-08-18T00:00:00.000Z'),
        new Date('2026-09-18T00:00:00.000Z'),
      );

      expect(() => cancelledMembership.renew(newTerm, clock)).toThrow(
        InvalidMembershipTransitionException,
      );
    });
  });

  describe('Operation: cancel and terminate', () => {
    it('should voluntarily cancel an ACTIVE membership with a recorded reason', () => {
      const membership = createMembershipWithStatus(MembershipStatus.ACTIVE);

      membership.cancel('Moved to another district', clock);

      expect(membership.isCancelled()).toBe(true);
      expect(membership.cancellationReason).toBe('Moved to another district');
      expect(membership.version).toBe(2);
    });

    it('should irrevocably terminate a membership with a documented reason', () => {
      const membership = createMembershipWithStatus(MembershipStatus.ACTIVE);

      membership.terminate('Severe facility damage and banned from premises', clock);

      expect(membership.isTerminated()).toBe(true);
      expect(membership.terminationReason).toBe('Severe facility damage and banned from premises');
      expect(membership.version).toBe(2);
    });

    it('should reject any further state mutations once TERMINATED', () => {
      const membership = createMembershipWithStatus(MembershipStatus.TERMINATED);
      const term = MembershipPeriod.create(
        new Date('2026-08-18T00:00:00.000Z'),
        new Date('2026-09-18T00:00:00.000Z'),
      );

      expect(() => membership.activate(clock)).toThrow(InvalidMembershipTransitionException);
      expect(() => membership.renew(term, clock)).toThrow(InvalidMembershipTransitionException);
      expect(() => membership.terminate('Double terminate', clock)).toThrow(
        InvalidMembershipTransitionException,
      );
    });
  });

  describe('Operation: assignTrainer, removeTrainer, changePlan', () => {
    it('should assign a trainer to an active membership', () => {
      const membership = createMembershipWithStatus(MembershipStatus.ACTIVE);

      membership.assignTrainer('trainer-coach-99', clock);

      expect(membership.trainerAssignment).toBeDefined();
      expect(membership.trainerAssignment?.trainerId).toBe('trainer-coach-99');
      expect(membership.trainerAssignment?.assignedAt).toEqual(clock.now());
      expect(membership.version).toBe(2);
    });

    it('should remove a trainer assignment from an active membership', () => {
      const membership = createMembershipWithStatus(MembershipStatus.ACTIVE);
      membership.assignTrainer('trainer-coach-99', clock);

      membership.removeTrainer(clock);

      expect(membership.trainerAssignment).toBeNull();
      expect(membership.version).toBe(3);
    });

    it('should change planId on an active membership', () => {
      const membership = createMembershipWithStatus(MembershipStatus.ACTIVE);

      membership.changePlan('plan-platinum-vip', clock);

      expect(membership.planId).toBe('plan-platinum-vip');
      expect(membership.version).toBe(2);
    });

    it('should reject trainer assignment or plan changes on a TERMINATED membership', () => {
      const membership = createMembershipWithStatus(MembershipStatus.TERMINATED);

      expect(() => membership.assignTrainer('trainer-1', clock)).toThrow(
        "Cannot assign trainer to a membership in 'TERMINATED' terminal status.",
      );
      expect(() => membership.changePlan('plan-2', clock)).toThrow(
        "Cannot change plan for a membership in 'TERMINATED' terminal status.",
      );
    });
  });
});
