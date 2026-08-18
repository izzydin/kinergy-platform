import { Membership } from './membership.aggregate';
import { MembershipId } from './membership-id.vo';
import { MembershipStatus } from './membership-status.enum';
import { MembershipPeriod } from './membership-period.vo';
import { FreezeWindow } from './freeze-window.vo';
import { TrainerAssignment } from './trainer-assignment.vo';
import { TestClock } from '../shared/clock';
import { InvalidMembershipPeriodException } from '../exceptions/invalid-membership-period.exception';

describe('Membership Aggregate Root — Design & Construction Invariants (Phase 5.2-A)', () => {
  const fixedNow = new Date('2026-08-18T10:00:00.000Z');
  let clock: TestClock;

  beforeEach(() => {
    clock = new TestClock(fixedNow);
  });

  describe('Safe Construction via Factory Method (Membership.create)', () => {
    it('should create a valid active Membership when start date is current or in the past', () => {
      const period = MembershipPeriod.create(
        new Date('2026-08-18T00:00:00.000Z'),
        new Date('2026-09-18T00:00:00.000Z'),
      );

      const membership = Membership.create(
        {
          clientId: 'client-123',
          planId: 'plan-gold-monthly',
          period,
        },
        clock,
      );

      expect(membership.id).toBeDefined();
      expect(membership.id.getValue()).toMatch(/^mem_/);
      expect(membership.version).toBe(1);
      expect(membership.status).toBe(MembershipStatus.ACTIVE);
      expect(membership.clientId).toBe('client-123');
      expect(membership.planId).toBe('plan-gold-monthly');
      expect(membership.period.equals(period)).toBe(true);
      expect(membership.freezeHistory).toEqual([]);
      expect(membership.trainerAssignment).toBeNull();
      expect(membership.createdAt).toEqual(fixedNow);
      expect(membership.updatedAt).toEqual(fixedNow);
    });

    it('should create a valid pending Membership when start date is in the future', () => {
      const futureStart = new Date('2026-09-01T00:00:00.000Z');
      const futureEnd = new Date('2026-10-01T00:00:00.000Z');
      const period = MembershipPeriod.create(futureStart, futureEnd);

      const membership = Membership.create(
        {
          clientId: 'client-456',
          planId: 'plan-silver-monthly',
          period,
        },
        clock,
      );

      expect(membership.status).toBe(MembershipStatus.PENDING);
      expect(membership.period.startDate).toEqual(futureStart);
    });

    it('should support custom MembershipId and optional TrainerAssignment on creation', () => {
      const customId = MembershipId.create('mem_custom_789');
      const period = MembershipPeriod.create(
        new Date('2026-08-18T00:00:00.000Z'),
        new Date('2026-09-18T00:00:00.000Z'),
      );
      const trainerAssignment = TrainerAssignment.create('trainer-coach-1', fixedNow);

      const membership = Membership.create(
        {
          id: customId,
          clientId: 'client-123',
          planId: 'plan-premium',
          period,
          trainerAssignment,
        },
        clock,
      );

      expect(membership.id.equals(customId)).toBe(true);
      expect(membership.trainerAssignment).toBeDefined();
      expect(membership.trainerAssignment?.trainerId).toBe('trainer-coach-1');
      expect(membership.trainerAssignment?.assignedAt).toEqual(fixedNow);
    });
  });

  describe('Invariant Rejection & Error Guards', () => {
    it('should throw an error if clientId is empty or whitespace', () => {
      const period = MembershipPeriod.create(
        new Date('2026-08-18T00:00:00.000Z'),
        new Date('2026-09-18T00:00:00.000Z'),
      );

      expect(() => {
        Membership.create({ clientId: '', planId: 'plan-1', period }, clock);
      }).toThrow('Client ID cannot be empty.');

      expect(() => {
        Membership.create({ clientId: '   ', planId: 'plan-1', period }, clock);
      }).toThrow('Client ID cannot be empty.');
    });

    it('should throw an error if planId is empty or whitespace', () => {
      const period = MembershipPeriod.create(
        new Date('2026-08-18T00:00:00.000Z'),
        new Date('2026-09-18T00:00:00.000Z'),
      );

      expect(() => {
        Membership.create({ clientId: 'client-123', planId: '', period }, clock);
      }).toThrow('Plan ID cannot be empty.');
    });

    it('should reject period where end date precedes start date', () => {
      expect(() => {
        MembershipPeriod.create(
          new Date('2026-09-18T00:00:00.000Z'),
          new Date('2026-08-18T00:00:00.000Z'),
        );
      }).toThrow(InvalidMembershipPeriodException);
    });
  });

  describe('Reconstitution from Persistence (Membership.reconstitute)', () => {
    it('should reconstitute existing Membership aggregate with complete historical state', () => {
      const id = MembershipId.create('mem_persisted_100');
      const period = MembershipPeriod.create(
        new Date('2026-01-01T00:00:00.000Z'),
        new Date('2026-02-15T00:00:00.000Z'),
      );
      const freeze = FreezeWindow.create(
        new Date('2026-01-10T00:00:00.000Z'),
        new Date('2026-01-25T00:00:00.000Z'),
        'Medical recovery',
      );
      const trainer = TrainerAssignment.create('trainer-55', new Date('2026-01-02T00:00:00.000Z'));
      const createdAt = new Date('2026-01-01T08:00:00.000Z');
      const updatedAt = new Date('2026-01-25T12:00:00.000Z');

      const membership = Membership.reconstitute({
        id,
        version: 3,
        status: MembershipStatus.ACTIVE,
        clientId: 'client-999',
        planId: 'plan-annual',
        period,
        freezeHistory: [freeze],
        trainerAssignment: trainer,
        createdAt,
        updatedAt,
      });

      expect(membership.id.getValue()).toBe('mem_persisted_100');
      expect(membership.version).toBe(3);
      expect(membership.status).toBe(MembershipStatus.ACTIVE);
      expect(membership.freezeHistory.length).toBe(1);
      expect(membership.freezeHistory[0]?.reason).toBe('Medical recovery');
      expect(membership.trainerAssignment?.trainerId).toBe('trainer-55');
      expect(membership.createdAt).toEqual(createdAt);
      expect(membership.updatedAt).toEqual(updatedAt);
      expect(membership.getUncommittedEvents()).toEqual([]);
    });

    it('should reject reconstitution with version < 1', () => {
      const id = MembershipId.create('mem_invalid_ver');
      const period = MembershipPeriod.create(
        new Date('2026-01-01T00:00:00.000Z'),
        new Date('2026-02-01T00:00:00.000Z'),
      );

      expect(() => {
        Membership.reconstitute({
          id,
          version: 0,
          status: MembershipStatus.ACTIVE,
          clientId: 'client-1',
          planId: 'plan-1',
          period,
          createdAt: fixedNow,
          updatedAt: fixedNow,
        });
      }).toThrow('Aggregate version must be greater than or equal to 1.');
    });
  });

  describe('Encapsulation & Immutability Protection', () => {
    it('should return defensive copies of Date timestamps and freeze history arrays', () => {
      const period = MembershipPeriod.create(
        new Date('2026-08-18T00:00:00.000Z'),
        new Date('2026-09-18T00:00:00.000Z'),
      );
      const membership = Membership.create(
        {
          clientId: 'client-123',
          planId: 'plan-gold',
          period,
        },
        clock,
      );

      // Attempt mutating the returned date
      const createdAtCopy = membership.createdAt;
      createdAtCopy.setFullYear(1999);
      expect(membership.createdAt.getFullYear()).toBe(2026);

      // Attempt mutating freeze history
      const history = membership.freezeHistory as FreezeWindow[];
      expect(() => {
        history.push(
          FreezeWindow.create(
            new Date('2026-08-20T00:00:00.000Z'),
            new Date('2026-08-25T00:00:00.000Z'),
          ),
        );
      }).not.toThrow();
      expect(membership.freezeHistory.length).toBe(0);
    });
  });
});
