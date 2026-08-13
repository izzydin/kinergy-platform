import { RecurrenceCalculationEngine } from './recurrence-calculation.engine';
import { RecurrencePattern } from '../value-objects/recurrence-pattern.vo';
import { RecurrenceFrequency } from '../value-objects/recurrence-frequency.enum';
import { RecurrenceException } from '../value-objects/recurrence-exception.vo';
import { TimeRange } from '../../value-objects/time-range.vo';

describe('RecurrenceCalculationEngine (Domain Temporal Engine)', () => {
  const SERIES_ID = 'rec_series_test_100';

  describe('Timezone & Daylight Saving Time (DST) Transitions', () => {
    it('accurately maintains local 10:00 AM wall-clock time across Spring forward DST transition in America/New_York', () => {
      // US Eastern Time: DST starts second Sunday in March (March 8, 2026).
      // Feb 17, 2026 (EST, UTC-5): 10:00 AM EST -> 15:00:00 UTC.
      // March 17, 2026 (EDT, UTC-4): 10:00 AM EDT -> 14:00:00 UTC.
      const pattern = RecurrencePattern.create({
        frequency: RecurrenceFrequency.WEEKLY,
        startDate: new Date('2026-02-17T15:00:00.000Z'), // Tuesday 10:00 AM EST
        maxOccurrences: 6,
        localStartTime: { hour: 10, minute: 0 },
        durationMinutes: 60,
        timezone: 'America/New_York',
      });

      const result = RecurrenceCalculationEngine.calculate({
        seriesId: SERIES_ID,
        pattern,
      });

      expect(result.slots).toHaveLength(6);

      // Pre-DST (EST = UTC-5)
      expect(result.slots[0]!.localDate).toEqual({
        year: 2026,
        month: 2,
        day: 17,
        hour: 10,
        minute: 0,
      });
      expect(result.slots[0]!.timeRange.start.toISOString()).toBe('2026-02-17T15:00:00.000Z');

      // Post-DST (EDT = UTC-4) -> local time is STILL 10:00 AM, UTC is 14:00
      const postDstSlot = result.slots.find(
        (s) => s.localDate.day === 17 && s.localDate.month === 3,
      );
      expect(postDstSlot).toBeDefined();
      expect(postDstSlot!.localDate).toEqual({
        year: 2026,
        month: 3,
        day: 17,
        hour: 10,
        minute: 0,
      });
      expect(postDstSlot!.timeRange.start.toISOString()).toBe('2026-03-17T14:00:00.000Z');
    });

    it('accurately maintains biweekly local time across DST transitions', () => {
      const pattern = RecurrencePattern.create({
        frequency: RecurrenceFrequency.BIWEEKLY,
        startDate: new Date('2026-02-17T15:00:00.000Z'),
        maxOccurrences: 4,
        localStartTime: { hour: 10, minute: 0 },
        durationMinutes: 60,
        timezone: 'America/New_York',
      });

      const result = RecurrenceCalculationEngine.calculate({
        seriesId: SERIES_ID,
        pattern,
      });

      expect(result.slots).toHaveLength(4);
      // Index 0: Feb 17 (EST) -> 15:00 UTC
      expect(result.slots[0]!.timeRange.start.toISOString()).toBe('2026-02-17T15:00:00.000Z');
      // Index 1: Mar 3 (EST) -> 15:00 UTC
      expect(result.slots[1]!.timeRange.start.toISOString()).toBe('2026-03-03T15:00:00.000Z');
      // Index 2: Mar 17 (EDT) -> 14:00 UTC
      expect(result.slots[2]!.timeRange.start.toISOString()).toBe('2026-03-17T14:00:00.000Z');
      // Index 3: Mar 31 (EDT) -> 14:00 UTC
      expect(result.slots[3]!.timeRange.start.toISOString()).toBe('2026-03-31T14:00:00.000Z');
    });
  });

  describe('Monthly Recurrence & Month-End Clamping Policy', () => {
    it('clamps 31st of the month to 28th/30th for shorter months (Jan 31 -> Feb 28 -> Mar 31 -> Apr 30)', () => {
      const pattern = RecurrencePattern.create({
        frequency: RecurrenceFrequency.MONTHLY,
        startDate: new Date('2026-01-31T14:00:00.000Z'),
        maxOccurrences: 5,
        localStartTime: { hour: 14, minute: 0 },
        durationMinutes: 60,
        timezone: 'UTC',
      });

      const result = RecurrenceCalculationEngine.calculate({
        seriesId: SERIES_ID,
        pattern,
      });

      expect(result.slots).toHaveLength(5);
      expect(result.slots[0]!.localDate).toEqual({
        year: 2026,
        month: 1,
        day: 31,
        hour: 14,
        minute: 0,
      });
      expect(result.slots[1]!.localDate).toEqual({
        year: 2026,
        month: 2,
        day: 28,
        hour: 14,
        minute: 0,
      });
      expect(result.slots[2]!.localDate).toEqual({
        year: 2026,
        month: 3,
        day: 31,
        hour: 14,
        minute: 0,
      });
      expect(result.slots[3]!.localDate).toEqual({
        year: 2026,
        month: 4,
        day: 30,
        hour: 14,
        minute: 0,
      });
      expect(result.slots[4]!.localDate).toEqual({
        year: 2026,
        month: 5,
        day: 31,
        hour: 14,
        minute: 0,
      });
    });

    it('handles leap-year February clamping correctly (Jan 31, 2028 -> Feb 29, 2028)', () => {
      const pattern = RecurrencePattern.create({
        frequency: RecurrenceFrequency.MONTHLY,
        startDate: new Date('2028-01-31T14:00:00.000Z'),
        maxOccurrences: 2,
        localStartTime: { hour: 14, minute: 0 },
        durationMinutes: 60,
        timezone: 'UTC',
      });

      const result = RecurrenceCalculationEngine.calculate({
        seriesId: SERIES_ID,
        pattern,
      });

      expect(result.slots).toHaveLength(2);
      expect(result.slots[0]!.localDate.day).toBe(31);
      expect(result.slots[1]!.localDate.day).toBe(29); // Leap year 2028
    });

    it('handles March 30 recurrence across annual cycle', () => {
      const pattern = RecurrencePattern.create({
        frequency: RecurrenceFrequency.MONTHLY,
        startDate: new Date('2026-03-30T10:00:00.000Z'),
        maxOccurrences: 12,
        localStartTime: { hour: 10, minute: 0 },
        durationMinutes: 60,
        timezone: 'UTC',
      });

      const result = RecurrenceCalculationEngine.calculate({
        seriesId: SERIES_ID,
        pattern,
      });

      expect(result.slots).toHaveLength(12);
      // Feb 2027 occurrence (index 11) should clamp to 28
      const febSlot = result.slots.find((s) => s.localDate.month === 2);
      expect(febSlot).toBeDefined();
      expect(febSlot!.localDate.day).toBe(28);
    });
  });

  describe('Generation Window Boundaries & Mid-Series Windows', () => {
    it('calculates occurrences when generation window starts in the middle of a series, preserving global occurrence index and keys', () => {
      const pattern = RecurrencePattern.create({
        frequency: RecurrenceFrequency.WEEKLY,
        startDate: new Date('2026-01-01T10:00:00.000Z'), // Week 0: Jan 1
        maxOccurrences: 10,
        localStartTime: { hour: 10, minute: 0 },
        durationMinutes: 60,
        timezone: 'UTC',
      });

      // Request window for February only (Feb 1 to Feb 28)
      const window = TimeRange.create(
        new Date('2026-02-01T00:00:00.000Z'),
        new Date('2026-02-28T23:59:59.000Z'),
      );

      const result = RecurrenceCalculationEngine.calculate({
        seriesId: SERIES_ID,
        pattern,
        window,
      });

      // Occurrences in Feb: Feb 5 (index 5), Feb 12 (index 6), Feb 19 (index 7), Feb 26 (index 8)
      expect(result.slots).toHaveLength(4);
      expect(result.slots[0]!.occurrenceIndex).toBe(5);
      expect(result.slots[0]!.occurrenceKey).toBe(`${SERIES_ID}:5`);
      expect(result.slots[0]!.timeRange.start.toISOString()).toBe('2026-02-05T10:00:00.000Z');

      expect(result.slots[3]!.occurrenceIndex).toBe(8);
      expect(result.slots[3]!.occurrenceKey).toBe(`${SERIES_ID}:8`);
      expect(result.slots[3]!.timeRange.start.toISOString()).toBe('2026-02-26T10:00:00.000Z');
    });

    it('stops generating when window ends before series completes', () => {
      const pattern = RecurrencePattern.create({
        frequency: RecurrenceFrequency.WEEKLY,
        startDate: new Date('2026-01-01T10:00:00.000Z'),
        maxOccurrences: 52,
        localStartTime: { hour: 10, minute: 0 },
        durationMinutes: 60,
        timezone: 'UTC',
      });

      // Window for only first 2 weeks
      const window = TimeRange.create(
        new Date('2026-01-01T00:00:00.000Z'),
        new Date('2026-01-10T00:00:00.000Z'),
      );

      const result = RecurrenceCalculationEngine.calculate({
        seriesId: SERIES_ID,
        pattern,
        window,
      });

      expect(result.slots).toHaveLength(2); // Jan 1 (index 0), Jan 8 (index 1)
      expect(result.isSeriesCompleted).toBe(false);
    });

    it('returns empty array when series endDate is before the requested generation window', () => {
      const pattern = RecurrencePattern.create({
        frequency: RecurrenceFrequency.WEEKLY,
        startDate: new Date('2025-01-01T10:00:00.000Z'),
        endDate: new Date('2025-03-01T10:00:00.000Z'),
        localStartTime: { hour: 10, minute: 0 },
        durationMinutes: 60,
        timezone: 'UTC',
      });

      const window = TimeRange.create(
        new Date('2026-01-01T00:00:00.000Z'),
        new Date('2026-02-01T00:00:00.000Z'),
      );

      const result = RecurrenceCalculationEngine.calculate({
        seriesId: SERIES_ID,
        pattern,
        window,
      });

      expect(result.slots).toHaveLength(0);
      expect(result.isSeriesCompleted).toBe(true);
    });

    it('includes occurrence when series start is exactly on window boundary', () => {
      const start = new Date('2026-08-01T10:00:00.000Z');
      const pattern = RecurrencePattern.create({
        frequency: RecurrenceFrequency.WEEKLY,
        startDate: start,
        maxOccurrences: 3,
        localStartTime: { hour: 10, minute: 0 },
        durationMinutes: 60,
        timezone: 'UTC',
      });

      const window = TimeRange.create(start, new Date('2026-08-10T00:00:00.000Z'));

      const result = RecurrenceCalculationEngine.calculate({
        seriesId: SERIES_ID,
        pattern,
        window,
      });

      expect(result.slots.length).toBeGreaterThanOrEqual(1);
      expect(result.slots[0]!.timeRange.start.getTime()).toBe(start.getTime());
    });
  });

  describe('Exception Handling & Skipped Occurrences', () => {
    it('flags skipped occurrences in slots and excludes them from activeSlots', () => {
      const pattern = RecurrencePattern.create({
        frequency: RecurrenceFrequency.WEEKLY,
        startDate: new Date('2026-08-01T10:00:00.000Z'),
        maxOccurrences: 4,
        localStartTime: { hour: 10, minute: 0 },
        durationMinutes: 60,
        timezone: 'UTC',
      });

      // Skip index 1 and index 3
      const exceptions = [
        RecurrenceException.createSkipped(
          1,
          new Date('2026-08-08T10:00:00.000Z'),
          'Patient holiday',
        ),
        RecurrenceException.createSkipped(
          3,
          new Date('2026-08-22T10:00:00.000Z'),
          'Facility maintenance',
        ),
      ];

      const result = RecurrenceCalculationEngine.calculate({
        seriesId: SERIES_ID,
        pattern,
        exceptions,
      });

      expect(result.slots).toHaveLength(4);
      expect(result.activeSlots).toHaveLength(2);

      expect(result.slots[0]!.isSkipped).toBe(false);
      expect(result.slots[1]!.isSkipped).toBe(true);
      expect(result.slots[1]!.skipReason).toBe('Patient holiday');
      expect(result.slots[2]!.isSkipped).toBe(false);
      expect(result.slots[3]!.isSkipped).toBe(true);
      expect(result.slots[3]!.skipReason).toBe('Facility maintenance');

      expect(result.activeSlots.map((s) => s.occurrenceIndex)).toEqual([0, 2]);
    });
  });

  describe('Property-Style & Invariant Verification', () => {
    it('produces strictly chronological occurrences without duplicates', () => {
      const pattern = RecurrencePattern.create({
        frequency: RecurrenceFrequency.WEEKLY,
        startDate: new Date('2026-01-01T10:00:00.000Z'),
        maxOccurrences: 20,
        localStartTime: { hour: 10, minute: 0 },
        durationMinutes: 60,
        timezone: 'UTC',
      });

      const result = RecurrenceCalculationEngine.calculate({
        seriesId: SERIES_ID,
        pattern,
      });

      expect(result.slots).toHaveLength(20);

      const seenKeys = new Set<string>();
      for (let i = 0; i < result.slots.length; i++) {
        const slot = result.slots[i]!;

        // No duplicate occurrence keys
        expect(seenKeys.has(slot.occurrenceKey)).toBe(false);
        seenKeys.add(slot.occurrenceKey);

        // Strict chronological ordering
        if (i > 0) {
          const prev = result.slots[i - 1]!;
          expect(slot.timeRange.start.getTime()).toBeGreaterThan(prev.timeRange.start.getTime());
        }
      }
    });

    it('is completely deterministic (same input produces identical output)', () => {
      const pattern = RecurrencePattern.create({
        frequency: RecurrenceFrequency.WEEKLY,
        startDate: new Date('2026-05-01T10:00:00.000Z'),
        maxOccurrences: 5,
        localStartTime: { hour: 10, minute: 0 },
        durationMinutes: 60,
        timezone: 'UTC',
      });

      const run1 = RecurrenceCalculationEngine.calculate({ seriesId: SERIES_ID, pattern });
      const run2 = RecurrenceCalculationEngine.calculate({ seriesId: SERIES_ID, pattern });

      expect(run1.slots.map((s) => s.occurrenceKey)).toEqual(
        run2.slots.map((s) => s.occurrenceKey),
      );
      expect(run1.slots.map((s) => s.timeRange.start.toISOString())).toEqual(
        run2.slots.map((s) => s.timeRange.start.toISOString()),
      );
    });

    it('never produces occurrences beyond maxOccurrences limit', () => {
      const pattern = RecurrencePattern.create({
        frequency: RecurrenceFrequency.WEEKLY,
        startDate: new Date('2026-01-01T10:00:00.000Z'),
        maxOccurrences: 3,
        localStartTime: { hour: 10, minute: 0 },
        durationMinutes: 60,
        timezone: 'UTC',
      });

      // Window requests 1 year
      const window = TimeRange.create(
        new Date('2026-01-01T00:00:00.000Z'),
        new Date('2027-01-01T00:00:00.000Z'),
      );

      const result = RecurrenceCalculationEngine.calculate({
        seriesId: SERIES_ID,
        pattern,
        window,
      });

      expect(result.slots).toHaveLength(3);
      expect(result.isSeriesCompleted).toBe(true);
    });
  });
});
