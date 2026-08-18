import { MembershipId } from './membership-id.vo';
import { MembershipPeriod } from './membership-period.vo';
import { FreezeWindow } from './freeze-window.vo';
import { TrainerAssignment } from './trainer-assignment.vo';
import { InvalidMembershipPeriodException } from '../exceptions/invalid-membership-period.exception';

describe('Gym Domain Value Objects Specification (Phase 5.2-F)', () => {
  describe('Value Object: MembershipId', () => {
    it('should generate a valid unique MembershipId with prefix when no value is provided', () => {
      const id1 = MembershipId.create();
      const id2 = MembershipId.create();

      expect(id1.value).toMatch(/^mem_\d+_[a-z0-9]+$/);
      expect(id2.value).toMatch(/^mem_\d+_[a-z0-9]+$/);
      expect(id1.equals(id2)).toBe(false);
    });

    it('should create a MembershipId with explicit string and trim whitespace', () => {
      const id = MembershipId.create('   mem_custom_123   ');

      expect(id.value).toBe('mem_custom_123');
      expect(id.getValue()).toBe('mem_custom_123');
      expect(id.toString()).toBe('mem_custom_123');
    });

    it('should reject empty or whitespace-only identifier strings', () => {
      expect(() => MembershipId.create('')).toThrow('Membership ID cannot be empty.');
      expect(() => MembershipId.create('    ')).toThrow('Membership ID cannot be empty.');
    });

    it('should evaluate structural equality correctly', () => {
      const id1 = MembershipId.create('mem_abc');
      const id2 = MembershipId.create('mem_abc');
      const id3 = MembershipId.create('mem_xyz');

      expect(id1.equals(id2)).toBe(true);
      expect(id1.equals(id3)).toBe(false);
      expect(id1.equals(null as unknown as MembershipId)).toBe(false);
    });

    it('should be immutable and frozen', () => {
      const id = MembershipId.create('mem_frozen');
      expect(Object.isFrozen(id)).toBe(true);
    });
  });

  describe('Value Object: MembershipPeriod', () => {
    const start = new Date('2026-08-01T00:00:00.000Z');
    const end = new Date('2026-08-31T00:00:00.000Z');

    it('should create a valid period with correct duration in days', () => {
      const period = MembershipPeriod.create(start, end);

      expect(period.startDate).toEqual(start);
      expect(period.endDate).toEqual(end);
      expect(period.durationDays).toBe(30);
    });

    it('should reject construction if startDate is not a valid Date', () => {
      expect(() => MembershipPeriod.create(null as unknown as Date, end)).toThrow(
        InvalidMembershipPeriodException,
      );
      expect(() => MembershipPeriod.create(new Date('invalid-date'), end)).toThrow(
        InvalidMembershipPeriodException,
      );
    });

    it('should reject construction if endDate is before or equal to startDate', () => {
      expect(() => MembershipPeriod.create(end, start)).toThrow(InvalidMembershipPeriodException);
      expect(() => MembershipPeriod.create(start, start)).toThrow(InvalidMembershipPeriodException);
    });

    it('should correctly evaluate date containment on exact boundaries', () => {
      const period = MembershipPeriod.create(start, end);

      // Start date exact match (inclusive)
      expect(period.contains(start)).toBe(true);
      // Mid-period match
      expect(period.contains(new Date('2026-08-15T12:00:00.000Z'))).toBe(true);
      // End date exact match (inclusive)
      expect(period.contains(end)).toBe(true);
      // Outside boundaries
      expect(period.contains(new Date('2026-07-31T23:59:59.999Z'))).toBe(false);
      expect(period.contains(new Date('2026-09-01T00:00:00.000Z'))).toBe(false);
    });

    it('should correctly evaluate expiration relative to a test date', () => {
      const period = MembershipPeriod.create(start, end);

      expect(period.isExpired(new Date('2026-08-15T00:00:00.000Z'))).toBe(false);
      expect(period.isExpired(end)).toBe(false);
      expect(period.isExpired(new Date('2026-09-01T00:00:00.000Z'))).toBe(true);
    });

    it('should extend validity period gaplessly, creating a new immutable value object', () => {
      const period = MembershipPeriod.create(start, end);
      const extended = period.extend(30);

      expect(extended.startDate).toEqual(start);
      expect(extended.endDate).toEqual(new Date('2026-09-30T00:00:00.000Z'));
      expect(extended.durationDays).toBe(60);
      // Original period remains unchanged
      expect(period.endDate).toEqual(end);
    });

    it('should reject extension with non-positive days', () => {
      const period = MembershipPeriod.create(start, end);

      expect(() => period.extend(0)).toThrow('Extension duration must be greater than zero days.');
      expect(() => period.extend(-5)).toThrow('Extension duration must be greater than zero days.');
    });

    it('should detect overlapping periods accurately', () => {
      const period1 = MembershipPeriod.create(
        new Date('2026-08-01T00:00:00.000Z'),
        new Date('2026-08-31T00:00:00.000Z'),
      );
      const overlapping = MembershipPeriod.create(
        new Date('2026-08-15T00:00:00.000Z'),
        new Date('2026-09-15T00:00:00.000Z'),
      );
      const nonOverlapping = MembershipPeriod.create(
        new Date('2026-09-01T00:00:00.000Z'),
        new Date('2026-09-30T00:00:00.000Z'),
      );

      expect(period1.overlaps(overlapping)).toBe(true);
      expect(period1.overlaps(nonOverlapping)).toBe(false);
    });

    it('should enforce immutability and equality', () => {
      const period1 = MembershipPeriod.create(start, end);
      const period2 = MembershipPeriod.create(new Date(start.getTime()), new Date(end.getTime()));

      expect(period1.equals(period2)).toBe(true);
      expect(Object.isFrozen(period1)).toBe(true);
    });
  });

  describe('Value Object: FreezeWindow', () => {
    const freezeStart = new Date('2026-08-05T00:00:00.000Z');
    const freezeEnd = new Date('2026-08-15T00:00:00.000Z');

    it('should create a valid FreezeWindow with duration calculation', () => {
      const freeze = FreezeWindow.create(freezeStart, freezeEnd, 'Medical recovery');

      expect(freeze.startDate).toEqual(freezeStart);
      expect(freeze.endDate).toEqual(freezeEnd);
      expect(freeze.reason).toBe('Medical recovery');
      expect(freeze.durationDays).toBe(10);
    });

    it('should reject freeze window if dates are invalid or reversed', () => {
      expect(() => FreezeWindow.create(null as unknown as Date, freezeEnd)).toThrow(
        'Freeze start date must be a valid Date.',
      );
      expect(() => FreezeWindow.create(freezeEnd, freezeStart)).toThrow(
        'Freeze end date cannot precede or equal start date.',
      );
      expect(() => FreezeWindow.create(freezeStart, freezeStart)).toThrow(
        'Freeze end date cannot precede or equal start date.',
      );
    });

    it('should check containment during freeze interval', () => {
      const freeze = FreezeWindow.create(freezeStart, freezeEnd);

      expect(freeze.contains(new Date('2026-08-10T00:00:00.000Z'))).toBe(true);
      expect(freeze.contains(new Date('2026-08-04T23:59:59.999Z'))).toBe(false);
      expect(freeze.contains(new Date('2026-08-16T00:00:00.000Z'))).toBe(false);
    });

    it('should evaluate structural equality and immutability', () => {
      const freeze1 = FreezeWindow.create(freezeStart, freezeEnd, 'Vacation');
      const freeze2 = FreezeWindow.create(
        new Date(freezeStart.getTime()),
        new Date(freezeEnd.getTime()),
        'Vacation',
      );

      expect(freeze1.equals(freeze2)).toBe(true);
      expect(Object.isFrozen(freeze1)).toBe(true);
    });
  });

  describe('Value Object: TrainerAssignment', () => {
    const assignedAt = new Date('2026-08-18T10:00:00.000Z');

    it('should create a valid TrainerAssignment with trimmed trainer identifier', () => {
      const assignment = TrainerAssignment.create('   trainer-coach-42   ', assignedAt);

      expect(assignment.trainerId).toBe('trainer-coach-42');
      expect(assignment.assignedAt).toEqual(assignedAt);
    });

    it('should reject empty or whitespace trainer identifier', () => {
      expect(() => TrainerAssignment.create('', assignedAt)).toThrow('Trainer ID cannot be empty.');
      expect(() => TrainerAssignment.create('    ', assignedAt)).toThrow(
        'Trainer ID cannot be empty.',
      );
    });

    it('should reject invalid assignment date', () => {
      expect(() => TrainerAssignment.create('trainer-1', null as unknown as Date)).toThrow(
        'Assigned date must be a valid Date.',
      );
    });

    it('should evaluate structural equality and immutability', () => {
      const a1 = TrainerAssignment.create('trainer-1', assignedAt);
      const a2 = TrainerAssignment.create('trainer-1', new Date(assignedAt.getTime()));
      const a3 = TrainerAssignment.create('trainer-2', assignedAt);

      expect(a1.equals(a2)).toBe(true);
      expect(a1.equals(a3)).toBe(false);
      expect(Object.isFrozen(a1)).toBe(true);
    });
  });
});
