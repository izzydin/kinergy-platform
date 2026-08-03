import { TimeRange } from '../value-objects/time-range.vo';
import { Duration } from '../value-objects/duration.vo';
import { TherapistSchedule } from '../therapist-schedule/therapist-schedule.aggregate';
import { WorkingHours } from '../therapist-schedule/value-objects/working-hours.vo';
import { BreakPeriod } from '../therapist-schedule/value-objects/break-period.vo';
import { VacationPeriod } from '../therapist-schedule/value-objects/vacation-period.vo';
import { AvailabilityOverride } from '../therapist-schedule/value-objects/availability-override.vo';
import { AppointmentOverlapSpecification } from '../specifications/appointment-overlap.specification';
import { AppointmentStatus } from '../value-objects/appointment-status.enum';

describe('Temporal Edge-Case & Boundary Tests', () => {
  describe('Boundary Condition: Touching Ranges (range1.end === range2.start)', () => {
    const slot1 = TimeRange.create(
      new Date('2026-08-03T10:00:00.000Z'),
      new Date('2026-08-03T11:00:00.000Z'),
    );
    const slot2 = TimeRange.create(
      new Date('2026-08-03T11:00:00.000Z'),
      new Date('2026-08-03T12:00:00.000Z'),
    );

    it('should identify that touching back-to-back ranges do NOT overlap', () => {
      expect(slot1.overlaps(slot2)).toBe(false);
      expect(slot2.overlaps(slot1)).toBe(false);
    });

    it('should identify that touching back-to-back ranges touch each other', () => {
      expect(slot1.touches(slot2)).toBe(true);
      expect(slot2.touches(slot1)).toBe(true);
    });

    it('should allow consecutive appointments without false overlap conflict', () => {
      const spec = new AppointmentOverlapSpecification();
      const existingAppointments = [
        {
          timeRange: slot1,
          status: AppointmentStatus.CONFIRMED,
        },
      ];

      // Booking slot2 (11:00 - 12:00) when slot1 (10:00 - 11:00) exists
      expect(spec.isSatisfiedBy({ candidateRange: slot2, existingAppointments })).toBe(true);
    });
  });

  describe('Leap Year Edge Cases (February 29)', () => {
    // 2028 is a Leap Year (Feb 29 exists)
    const leapDaySlot = TimeRange.create(
      new Date('2028-02-29T09:00:00.000Z'),
      new Date('2028-02-29T10:00:00.000Z'),
    );

    it('should calculate valid TimeRange and Duration on February 29 in leap year', () => {
      expect(leapDaySlot.start.getUTCFullYear()).toBe(2028);
      expect(leapDaySlot.start.getUTCMonth()).toBe(1); // February (0-indexed)
      expect(leapDaySlot.start.getUTCDate()).toBe(29);
      expect(leapDaySlot.duration().toMinutes()).toBe(60);
    });

    it('should resolve therapist availability correctly on leap day', () => {
      // 2028-02-29 is Tuesday (Day 2)
      const tuesday9to17 = WorkingHours.fromTimeStrings(2, '09:00', '17:00');
      const schedule = TherapistSchedule.create({
        therapistId: 'therapist_leap',
        workingHours: [tuesday9to17],
      });

      expect(schedule.isWorking(leapDaySlot)).toBe(true);
      expect(schedule.isAvailable(leapDaySlot)).toBe(true);
    });

    it('should advance search across Feb 28 to Feb 29 seamlessly in leap year', () => {
      const tuesday9to17 = WorkingHours.fromTimeStrings(2, '09:00', '17:00');
      const schedule = TherapistSchedule.create({
        therapistId: 'therapist_leap',
        workingHours: [tuesday9to17],
      });

      const feb28Start = new Date('2028-02-28T18:00:00.000Z'); // Monday evening
      const slot = schedule.nextAvailableSlot(feb28Start, Duration.fromHours(1), 7);

      expect(slot).not.toBeNull();
      expect(slot?.start.toISOString()).toBe('2028-02-29T09:00:00.000Z');
    });
  });

  describe('Year-End Midnight Rollover (Dec 31 to Jan 1)', () => {
    const yearEndSlot = TimeRange.create(
      new Date('2026-12-31T23:30:00.000Z'),
      new Date('2027-01-01T00:30:00.000Z'),
    );

    it('should create valid TimeRange spanning across year-end midnight', () => {
      expect(yearEndSlot.start.getUTCFullYear()).toBe(2026);
      expect(yearEndSlot.end.getUTCFullYear()).toBe(2027);
      expect(yearEndSlot.duration().toMinutes()).toBe(60);
    });

    it('should correctly evaluate gap and intersection across year boundary', () => {
      const newYearMorningSlot = TimeRange.create(
        new Date('2027-01-01T01:00:00.000Z'),
        new Date('2027-01-01T02:00:00.000Z'),
      );

      const gap = yearEndSlot.gap(newYearMorningSlot);
      expect(gap).not.toBeNull();
      expect(gap?.duration().toMinutes()).toBe(30);
    });
  });

  describe('Multi-Day Vacation & Priority Override Resolution', () => {
    // 2026-08-03 is Monday (Day 1)
    const monday9to17 = WorkingHours.fromTimeStrings(1, '09:00', '17:00');
    const lunchBreak = BreakPeriod.createRecurring(1, 12 * 60, 13 * 60);

    const multiDayVacation = VacationPeriod.create(
      TimeRange.create(new Date('2026-08-01T00:00:00.000Z'), new Date('2026-08-14T23:59:59.000Z')),
      'Summer Holiday',
    );

    it('should block all work hours during multi-day vacation', () => {
      const schedule = TherapistSchedule.create({
        therapistId: 'therapist_vacation',
        workingHours: [monday9to17],
        breaks: [lunchBreak],
        vacations: [multiDayVacation],
      });

      const mondayWorkSlot = TimeRange.create(
        new Date('2026-08-03T10:00:00.000Z'),
        new Date('2026-08-03T11:00:00.000Z'),
      );

      expect(schedule.isVacation(mondayWorkSlot)).toBe(true);
      expect(schedule.isAvailable(mondayWorkSlot)).toBe(false);
    });

    it('should allow single-day AVAILABLE override to take precedence when no vacation blocks', () => {
      const specialAvailableOverride = AvailabilityOverride.create(
        TimeRange.create(
          new Date('2026-08-03T09:00:00.000Z'),
          new Date('2026-08-03T12:00:00.000Z'),
        ),
        'AVAILABLE',
        'Emergency Clinic Duty',
      );

      const schedule = TherapistSchedule.create({
        therapistId: 'therapist_override',
        workingHours: [monday9to17],
        overrides: [specialAvailableOverride],
      });

      const workSlot = TimeRange.create(
        new Date('2026-08-03T10:00:00.000Z'),
        new Date('2026-08-03T11:00:00.000Z'),
      );

      expect(schedule.isAvailable(workSlot)).toBe(true);
    });
  });
});
