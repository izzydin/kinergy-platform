import { TherapistSchedule } from './therapist-schedule.aggregate';
import {
  ScheduleId,
  WorkingHours,
  BreakPeriod,
  VacationPeriod,
  AvailabilityOverride,
} from './value-objects';
import { TimeRange } from '../value-objects/time-range.vo';
import { Duration } from '../value-objects/duration.vo';

describe('TherapistSchedule Aggregate Root', () => {
  // Monday = Day 1
  const monday9to17 = WorkingHours.fromTimeStrings(1, '09:00', '17:00');
  const mondayLunchBreak = BreakPeriod.createRecurring(1, 12 * 60, 13 * 60);

  it('should initialize TherapistSchedule with default values', () => {
    const schedule = TherapistSchedule.create({
      therapistId: 'therapist_100',
    });

    expect(schedule.id).toBeInstanceOf(ScheduleId);
    expect(schedule.therapistId).toBe('therapist_100');
    expect(schedule.version).toBe(1);
    expect(schedule.timezone).toBe('UTC');
    expect(schedule.workingHours).toHaveLength(0);
  });

  describe('Availability & Priority Resolution', () => {
    it('should determine working hours correctly', () => {
      const schedule = TherapistSchedule.create({
        therapistId: 'therapist_100',
        workingHours: [monday9to17],
      });

      // 2026-08-03 is a Monday
      const mondayWorkRange = TimeRange.create(
        new Date('2026-08-03T10:00:00.000Z'),
        new Date('2026-08-03T11:00:00.000Z'),
      );
      expect(schedule.isWorking(mondayWorkRange)).toBe(true);
      expect(schedule.isAvailable(mondayWorkRange)).toBe(true);

      // Outside working hours (08:00 - 09:00)
      const earlyRange = TimeRange.create(
        new Date('2026-08-03T08:00:00.000Z'),
        new Date('2026-08-03T09:00:00.000Z'),
      );
      expect(schedule.isWorking(earlyRange)).toBe(false);
      expect(schedule.isAvailable(earlyRange)).toBe(false);
    });

    it('should reject slot during break period (Break priority)', () => {
      const schedule = TherapistSchedule.create({
        therapistId: 'therapist_100',
        workingHours: [monday9to17],
        breaks: [mondayLunchBreak],
      });

      // 12:15 to 12:45 overlaps 12:00-13:00 break
      const lunchRange = TimeRange.create(
        new Date('2026-08-03T12:15:00.000Z'),
        new Date('2026-08-03T12:45:00.000Z'),
      );

      expect(schedule.isBreak(lunchRange)).toBe(true);
      expect(schedule.isAvailable(lunchRange)).toBe(false);
    });

    it('should reject slot during vacation period (Vacation priority 1)', () => {
      const vacationRange = TimeRange.create(
        new Date('2026-08-03T00:00:00.000Z'),
        new Date('2026-08-07T23:59:59.000Z'),
      );
      const vacation = VacationPeriod.create(vacationRange, 'Summer Vacation');

      const schedule = TherapistSchedule.create({
        therapistId: 'therapist_100',
        workingHours: [monday9to17],
        vacations: [vacation],
      });

      const slot = TimeRange.create(
        new Date('2026-08-03T10:00:00.000Z'),
        new Date('2026-08-03T11:00:00.000Z'),
      );

      expect(schedule.isVacation(slot)).toBe(true);
      expect(schedule.isAvailable(slot)).toBe(false);
    });

    it('should grant availability via AVAILABLE override even outside base working hours', () => {
      const sundayOverrideRange = TimeRange.create(
        new Date('2026-08-02T10:00:00.000Z'), // 2026-08-02 is a Sunday
        new Date('2026-08-02T14:00:00.000Z'),
      );
      const override = AvailabilityOverride.create(
        sundayOverrideRange,
        'AVAILABLE',
        'Special Sunday Clinic',
      );

      const schedule = TherapistSchedule.create({
        therapistId: 'therapist_100',
        workingHours: [monday9to17],
        overrides: [override],
      });

      const sundaySlot = TimeRange.create(
        new Date('2026-08-02T11:00:00.000Z'),
        new Date('2026-08-02T12:00:00.000Z'),
      );

      expect(schedule.isWorking(sundaySlot)).toBe(false);
      expect(schedule.isAvailable(sundaySlot)).toBe(true);
    });

    it('should revoke availability via UNAVAILABLE override', () => {
      const emergencyOffRange = TimeRange.create(
        new Date('2026-08-03T09:00:00.000Z'),
        new Date('2026-08-03T12:00:00.000Z'),
      );
      const override = AvailabilityOverride.create(
        emergencyOffRange,
        'UNAVAILABLE',
        'Personal Emergency',
      );

      const schedule = TherapistSchedule.create({
        therapistId: 'therapist_100',
        workingHours: [monday9to17],
        overrides: [override],
      });

      const slot = TimeRange.create(
        new Date('2026-08-03T10:00:00.000Z'),
        new Date('2026-08-03T11:00:00.000Z'),
      );

      expect(schedule.isWorking(slot)).toBe(true);
      expect(schedule.isAvailable(slot)).toBe(false);
    });
  });

  describe('Slot Calculation (nextAvailableSlot)', () => {
    it('should find the next available slot after specified timestamp', () => {
      const schedule = TherapistSchedule.create({
        therapistId: 'therapist_100',
        workingHours: [monday9to17],
        breaks: [mondayLunchBreak],
      });

      // Inquire after Monday 2026-08-03 08:00 UTC
      const after = new Date('2026-08-03T08:00:00.000Z');
      const duration = Duration.fromMinutes(60);

      const slot = schedule.nextAvailableSlot(after, duration);

      expect(slot).not.toBeNull();
      expect(slot?.start.toISOString()).toBe('2026-08-03T09:00:00.000Z');
      expect(slot?.end.toISOString()).toBe('2026-08-03T10:00:00.000Z');
    });

    it('should return null when no slot is available within search limit', () => {
      const schedule = TherapistSchedule.create({
        therapistId: 'therapist_100',
        // No working hours
      });

      const after = new Date('2026-08-03T08:00:00.000Z');
      const duration = Duration.fromMinutes(60);

      expect(schedule.nextAvailableSlot(after, duration, 7)).toBeNull();
    });
  });

  describe('Management Methods & Versioning', () => {
    it('should increment version on adding working hours, breaks, vacations, and overrides', () => {
      const schedule = TherapistSchedule.create({
        therapistId: 'therapist_100',
      });
      expect(schedule.version).toBe(1);

      schedule.addWorkingHours(monday9to17);
      expect(schedule.version).toBe(2);
      expect(schedule.workingHours).toHaveLength(1);

      schedule.addBreak(mondayLunchBreak);
      expect(schedule.version).toBe(3);
      expect(schedule.breaks).toHaveLength(1);

      schedule.addVacation(
        VacationPeriod.create(
          TimeRange.create(
            new Date('2026-09-01T00:00:00.000Z'),
            new Date('2026-09-10T00:00:00.000Z'),
          ),
        ),
      );
      expect(schedule.version).toBe(4);
      expect(schedule.vacations).toHaveLength(1);

      schedule.addOverride(
        AvailabilityOverride.create(
          TimeRange.create(
            new Date('2026-10-01T09:00:00.000Z'),
            new Date('2026-10-01T12:00:00.000Z'),
          ),
          'UNAVAILABLE',
        ),
      );
      expect(schedule.version).toBe(5);
      expect(schedule.overrides).toHaveLength(1);
    });
  });
});
