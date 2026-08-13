import { RecurrenceSeries } from './recurrence-series.aggregate';
import { RecurrencePattern } from './value-objects/recurrence-pattern.vo';
import { RecurrenceFrequency } from './value-objects/recurrence-frequency.enum';
import { SeriesStatus } from './value-objects/series-status.enum';
import { TestClock } from '../shared/clock';

describe('RecurrenceSeries Aggregate & Value Objects (Domain Layer)', () => {
  let testClock: TestClock;

  beforeEach(() => {
    testClock = new TestClock(new Date('2026-08-15T10:00:00.000Z'), 'UTC');
  });

  describe('RecurrencePattern Value Object Invariants', () => {
    it('throws error when creating pattern with invalid frequency', () => {
      expect(() =>
        RecurrencePattern.create({
          frequency: 'ANNUALLY' as unknown as RecurrenceFrequency,
          startDate: new Date('2026-01-31T10:00:00.000Z'),
          localStartTime: { hour: 10, minute: 0 },
          durationMinutes: 60,
        }),
      ).toThrow("Invalid recurrence frequency: 'ANNUALLY'.");
    });

    it('throws error when endDate is before or equal to startDate', () => {
      expect(() =>
        RecurrencePattern.create({
          frequency: RecurrenceFrequency.WEEKLY,
          startDate: new Date('2026-08-15T10:00:00.000Z'),
          endDate: new Date('2026-08-15T10:00:00.000Z'),
          localStartTime: { hour: 10, minute: 0 },
          durationMinutes: 60,
        }),
      ).toThrow('endDate must be strictly after startDate.');
    });

    it('throws error when maxOccurrences is less than 1', () => {
      expect(() =>
        RecurrencePattern.create({
          frequency: RecurrenceFrequency.WEEKLY,
          startDate: new Date('2026-08-15T10:00:00.000Z'),
          maxOccurrences: 0,
          localStartTime: { hour: 10, minute: 0 },
          durationMinutes: 60,
        }),
      ).toThrow('maxOccurrences must be an integer greater than or equal to 1.');
    });

    it('throws error when localStartTime hours or minutes are out of bounds', () => {
      expect(() =>
        RecurrencePattern.create({
          frequency: RecurrenceFrequency.WEEKLY,
          startDate: new Date('2026-08-15T10:00:00.000Z'),
          localStartTime: { hour: 25, minute: 0 },
          durationMinutes: 60,
        }),
      ).toThrow('Valid localStartTime (hour 0..23, minute 0..59) is required.');
    });

    it('throws error when durationMinutes is non-positive', () => {
      expect(() =>
        RecurrencePattern.create({
          frequency: RecurrenceFrequency.WEEKLY,
          startDate: new Date('2026-08-15T10:00:00.000Z'),
          localStartTime: { hour: 10, minute: 0 },
          durationMinutes: -30,
        }),
      ).toThrow('durationMinutes must be a positive integer.');
    });
  });

  describe('Deterministic Date Generation & Monthly Clamping Policy', () => {
    it('generates weekly dates 7 days apart', () => {
      const pattern = RecurrencePattern.create({
        frequency: RecurrenceFrequency.WEEKLY,
        startDate: new Date('2026-08-01T10:00:00.000Z'), // Saturday
        maxOccurrences: 3,
        localStartTime: { hour: 10, minute: 0 },
        durationMinutes: 60,
      });

      const dates = pattern.generateOccurrenceDates();
      expect(dates).toHaveLength(3);
      expect(dates[0]!.toISOString()).toBe('2026-08-01T10:00:00.000Z');
      expect(dates[1]!.toISOString()).toBe('2026-08-08T10:00:00.000Z');
      expect(dates[2]!.toISOString()).toBe('2026-08-15T10:00:00.000Z');
    });

    it('generates biweekly dates 14 days apart', () => {
      const pattern = RecurrencePattern.create({
        frequency: RecurrenceFrequency.BIWEEKLY,
        startDate: new Date('2026-08-01T10:00:00.000Z'),
        maxOccurrences: 3,
        localStartTime: { hour: 10, minute: 0 },
        durationMinutes: 60,
      });

      const dates = pattern.generateOccurrenceDates();
      expect(dates).toHaveLength(3);
      expect(dates[0]!.toISOString()).toBe('2026-08-01T10:00:00.000Z');
      expect(dates[1]!.toISOString()).toBe('2026-08-15T10:00:00.000Z');
      expect(dates[2]!.toISOString()).toBe('2026-08-29T10:00:00.000Z');
    });

    it('clamps monthly occurrences to the last day of shorter months (Jan 31 -> Feb 28/29, Mar 31 -> Apr 30)', () => {
      const pattern = RecurrencePattern.create({
        frequency: RecurrenceFrequency.MONTHLY,
        startDate: new Date('2026-01-31T10:00:00.000Z'),
        maxOccurrences: 4,
        localStartTime: { hour: 10, minute: 0 },
        durationMinutes: 60,
      });

      const dates = pattern.generateOccurrenceDates();
      expect(dates).toHaveLength(4);
      // Jan 31 -> Feb 28 (2026 non-leap year) -> Mar 31 -> Apr 30
      expect(dates[0]!.toISOString()).toBe('2026-01-31T10:00:00.000Z');
      expect(dates[1]!.toISOString()).toBe('2026-02-28T10:00:00.000Z');
      expect(dates[2]!.toISOString()).toBe('2026-03-31T10:00:00.000Z');
      expect(dates[3]!.toISOString()).toBe('2026-04-30T10:00:00.000Z');
    });

    it('handles leap-year February clamping correctly (Jan 31 2028 -> Feb 29 2028)', () => {
      const pattern = RecurrencePattern.create({
        frequency: RecurrenceFrequency.MONTHLY,
        startDate: new Date('2028-01-31T10:00:00.000Z'),
        maxOccurrences: 2,
        localStartTime: { hour: 10, minute: 0 },
        durationMinutes: 60,
      });

      const dates = pattern.generateOccurrenceDates();
      expect(dates).toHaveLength(2);
      expect(dates[0]!.toISOString()).toBe('2028-01-31T10:00:00.000Z');
      expect(dates[1]!.toISOString()).toBe('2028-02-29T10:00:00.000Z'); // Leap year 2028
    });
  });

  describe('RecurrenceSeries Aggregate Root Invariants & Lifecycle', () => {
    it('creates RecurrenceSeries and records RecurringAppointmentCreatedEvent', () => {
      const pattern = RecurrencePattern.create({
        frequency: RecurrenceFrequency.WEEKLY,
        startDate: new Date('2026-08-15T10:00:00.000Z'),
        maxOccurrences: 6,
        localStartTime: { hour: 10, minute: 0 },
        durationMinutes: 60,
      });

      const series = RecurrenceSeries.create(
        {
          pattern,
          clientId: 'client_rec',
          therapistId: 'therapist_rec',
          roomId: 'room_rec',
          serviceType: 'TREATMENT',
        },
        testClock,
      );

      expect(series.status).toBe(SeriesStatus.ACTIVE);
      expect(series.version).toBe(1);
      expect(series.clientId).toBe('client_rec');
      expect(series.therapistId).toBe('therapist_rec');
      expect(series.roomId).toBe('room_rec');

      const events = series.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]!.eventName).toBe('RecurringAppointmentCreated');
    });

    it('throws error when template parameters are empty', () => {
      const pattern = RecurrencePattern.create({
        frequency: RecurrenceFrequency.WEEKLY,
        startDate: new Date('2026-08-15T10:00:00.000Z'),
        localStartTime: { hour: 10, minute: 0 },
        durationMinutes: 60,
      });

      expect(() =>
        RecurrenceSeries.create({
          pattern,
          clientId: '',
          therapistId: 'therapist_1',
          roomId: 'room_1',
          serviceType: 'TREATMENT',
        }),
      ).toThrow('clientId is required for RecurrenceSeries.');
    });

    it('records skipped occurrence exception and emits OccurrenceSkippedEvent', () => {
      const pattern = RecurrencePattern.create({
        frequency: RecurrenceFrequency.WEEKLY,
        startDate: new Date('2026-08-15T10:00:00.000Z'),
        maxOccurrences: 4,
        localStartTime: { hour: 10, minute: 0 },
        durationMinutes: 60,
      });

      const series = RecurrenceSeries.create(
        {
          pattern,
          clientId: 'client_rec',
          therapistId: 'therapist_rec',
          roomId: 'room_rec',
          serviceType: 'TREATMENT',
        },
        testClock,
      );

      series.skipOccurrence(
        1,
        new Date('2026-08-22T10:00:00.000Z'),
        'Patient on vacation',
        testClock,
      );

      expect(series.exceptions).toHaveLength(1);
      expect(series.exceptions[0]!.occurrenceIndex).toBe(1);
      expect(series.exceptions[0]!.type).toBe('SKIPPED');

      const events = series.getUncommittedEvents();
      expect(events).toHaveLength(2); // Created + Skipped
      expect(events[1]!.eventName).toBe('OccurrenceSkipped');
    });

    it('throws error when attempting to skip duplicate occurrence index', () => {
      const pattern = RecurrencePattern.create({
        frequency: RecurrenceFrequency.WEEKLY,
        startDate: new Date('2026-08-15T10:00:00.000Z'),
        localStartTime: { hour: 10, minute: 0 },
        durationMinutes: 60,
      });

      const series = RecurrenceSeries.create(
        {
          pattern,
          clientId: 'c_dup',
          therapistId: 't_dup',
          roomId: 'r_dup',
          serviceType: 'TREATMENT',
        },
        testClock,
      );

      series.skipOccurrence(2, new Date('2026-08-29T10:00:00.000Z'), 'Skip 1', testClock);
      expect(() =>
        series.skipOccurrence(2, new Date('2026-08-29T10:00:00.000Z'), 'Skip 2', testClock),
      ).toThrow('Occurrence index 2 already has an exception recorded.');
    });

    it('cancels series and records RecurringSeriesCancelledEvent', () => {
      const pattern = RecurrencePattern.create({
        frequency: RecurrenceFrequency.WEEKLY,
        startDate: new Date('2026-08-15T10:00:00.000Z'),
        localStartTime: { hour: 10, minute: 0 },
        durationMinutes: 60,
      });

      const series = RecurrenceSeries.create(
        {
          pattern,
          clientId: 'c_cancel',
          therapistId: 't_cancel',
          roomId: 'r_cancel',
          serviceType: 'TREATMENT',
        },
        testClock,
      );

      series.cancel('Client moved out of city', testClock);

      expect(series.status).toBe(SeriesStatus.CANCELLED);
      expect(series.cancellationReason).toBe('Client moved out of city');

      const events = series.getUncommittedEvents();
      expect(events[1]!.eventName).toBe('RecurringSeriesCancelled');
    });

    it('throws error when skipping occurrence on cancelled series', () => {
      const pattern = RecurrencePattern.create({
        frequency: RecurrenceFrequency.WEEKLY,
        startDate: new Date('2026-08-15T10:00:00.000Z'),
        localStartTime: { hour: 10, minute: 0 },
        durationMinutes: 60,
      });

      const series = RecurrenceSeries.create(
        {
          pattern,
          clientId: 'c_err',
          therapistId: 't_err',
          roomId: 'r_err',
          serviceType: 'TREATMENT',
        },
        testClock,
      );

      series.cancel('Terminated', testClock);

      expect(() =>
        series.skipOccurrence(0, new Date('2026-08-15T10:00:00.000Z'), 'Skip', testClock),
      ).toThrow("Cannot skip occurrence on non-active recurrence series (Status: 'CANCELLED').");
    });
  });
});
