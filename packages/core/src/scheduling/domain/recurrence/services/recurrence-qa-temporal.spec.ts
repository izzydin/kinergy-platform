import { RecurrenceCalculationEngine } from './recurrence-calculation.engine';
import { RecurrencePattern } from '../value-objects/recurrence-pattern.vo';
import { RecurrenceFrequency } from '../value-objects/recurrence-frequency.enum';
import { TimeRange } from '../../value-objects/time-range.vo';

describe('RecurrenceCalculationEngine QA Temporal Test Suite', () => {
  const SERIES_ID = 'rec_series_qa_temporal_001';

  describe('1. Leap Year & Date Arithmetic', () => {
    it('correctly handles February 29 in a Leap Year (2028) vs February 28 in non-leap year (2029)', () => {
      // Monthly series starting on Jan 29, 2028 (2028 is a leap year)
      const pattern2028 = RecurrencePattern.create({
        frequency: RecurrenceFrequency.MONTHLY,
        startDate: new Date('2028-01-29T10:00:00.000Z'),
        maxOccurrences: 3,
        localStartTime: { hour: 10, minute: 0 },
        durationMinutes: 60,
        timezone: 'UTC',
      });

      const result2028 = RecurrenceCalculationEngine.calculate({
        seriesId: SERIES_ID,
        pattern: pattern2028,
      });

      expect(result2028.slots).toHaveLength(3);
      expect(result2028.slots[0]!.localDate).toEqual({
        year: 2028,
        month: 1,
        day: 29,
        hour: 10,
        minute: 0,
      });
      // In 2028, Feb 29 exists and should be used
      expect(result2028.slots[1]!.localDate).toEqual({
        year: 2028,
        month: 2,
        day: 29,
        hour: 10,
        minute: 0,
      });
      expect(result2028.slots[2]!.localDate).toEqual({
        year: 2028,
        month: 3,
        day: 29,
        hour: 10,
        minute: 0,
      });

      // Monthly series starting on Jan 29, 2029 (2029 is NOT a leap year -> clamped to Feb 28)
      const pattern2029 = RecurrencePattern.create({
        frequency: RecurrenceFrequency.MONTHLY,
        startDate: new Date('2029-01-29T10:00:00.000Z'),
        maxOccurrences: 3,
        localStartTime: { hour: 10, minute: 0 },
        durationMinutes: 60,
        timezone: 'UTC',
      });

      const result2029 = RecurrenceCalculationEngine.calculate({
        seriesId: SERIES_ID,
        pattern: pattern2029,
      });

      expect(result2029.slots).toHaveLength(3);
      expect(result2029.slots[0]!.localDate).toEqual({
        year: 2029,
        month: 1,
        day: 29,
        hour: 10,
        minute: 0,
      });
      // In 2029, Feb 29 does not exist -> clamped to Feb 28
      expect(result2029.slots[1]!.localDate).toEqual({
        year: 2029,
        month: 2,
        day: 28,
        hour: 10,
        minute: 0,
      });
      expect(result2029.slots[2]!.localDate).toEqual({
        year: 2029,
        month: 3,
        day: 29,
        hour: 10,
        minute: 0,
      });
    });

    it('correctly handles series starting on Feb 29 in a Leap Year (2028) across 4 consecutive months', () => {
      const pattern = RecurrencePattern.create({
        frequency: RecurrenceFrequency.MONTHLY,
        startDate: new Date('2028-02-29T14:00:00.000Z'),
        maxOccurrences: 4,
        localStartTime: { hour: 14, minute: 0 },
        durationMinutes: 60,
        timezone: 'UTC',
      });

      const result = RecurrenceCalculationEngine.calculate({
        seriesId: SERIES_ID,
        pattern,
      });

      expect(result.slots).toHaveLength(4);
      expect(result.slots[0]!.localDate).toEqual({
        year: 2028,
        month: 2,
        day: 29,
        hour: 14,
        minute: 0,
      });
      expect(result.slots[1]!.localDate).toEqual({
        year: 2028,
        month: 3,
        day: 29,
        hour: 14,
        minute: 0,
      });
      expect(result.slots[2]!.localDate).toEqual({
        year: 2028,
        month: 4,
        day: 29,
        hour: 14,
        minute: 0,
      });
      expect(result.slots[3]!.localDate).toEqual({
        year: 2028,
        month: 5,
        day: 29,
        hour: 14,
        minute: 0,
      });
    });
  });

  describe('2. Month-End Clamping for 31-Day Series', () => {
    it('properly clamps 31st of the month across Jan 31 -> Feb 28 -> Mar 31 -> Apr 30 -> May 31 -> Jun 30', () => {
      const pattern = RecurrencePattern.create({
        frequency: RecurrenceFrequency.MONTHLY,
        startDate: new Date('2026-01-31T09:00:00.000Z'),
        maxOccurrences: 6,
        localStartTime: { hour: 9, minute: 0 },
        durationMinutes: 60,
        timezone: 'UTC',
      });

      const result = RecurrenceCalculationEngine.calculate({
        seriesId: SERIES_ID,
        pattern,
      });

      expect(result.slots).toHaveLength(6);
      expect(result.slots.map((s) => `${s.localDate.month}-${s.localDate.day}`)).toEqual([
        '1-31',
        '2-28',
        '3-31',
        '4-30',
        '5-31',
        '6-30',
      ]);
    });
  });

  describe('3. Daylight Saving Time (DST) Transitions across Diverse Hemispheres', () => {
    it('preserves 10:00 AM wall-clock across US Eastern Time Fall Back (EDT -> EST in Nov 2026)', () => {
      // US Eastern Fall Back: First Sunday in November (Nov 1, 2026)
      // Oct 27, 2026 (EDT, UTC-4): 10:00 AM EDT -> 14:00:00 UTC
      // Nov 10, 2026 (EST, UTC-5): 10:00 AM EST -> 15:00:00 UTC
      const pattern = RecurrencePattern.create({
        frequency: RecurrenceFrequency.WEEKLY,
        startDate: new Date('2026-10-27T14:00:00.000Z'),
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

      // Pre-Fall-Back: Oct 27 (EDT = UTC-4)
      expect(result.slots[0]!.localDate.hour).toBe(10);
      expect(result.slots[0]!.timeRange.start.toISOString()).toBe('2026-10-27T14:00:00.000Z');

      // Post-Fall-Back: Nov 3 (EST = UTC-5)
      expect(result.slots[1]!.localDate.hour).toBe(10);
      expect(result.slots[1]!.timeRange.start.toISOString()).toBe('2026-11-03T15:00:00.000Z');

      // Post-Fall-Back: Nov 10 (EST = UTC-5)
      expect(result.slots[2]!.localDate.hour).toBe(10);
      expect(result.slots[2]!.timeRange.start.toISOString()).toBe('2026-11-10T15:00:00.000Z');
    });

    it('preserves 09:00 AM wall-clock in Europe/London across Spring Forward (BST start in March 2026)', () => {
      // UK Spring Forward: Last Sunday in March (March 29, 2026)
      // March 24, 2026 (GMT, UTC+0): 09:00 AM GMT -> 09:00:00 UTC
      // March 31, 2026 (BST, UTC+1): 09:00 AM BST -> 08:00:00 UTC
      const pattern = RecurrencePattern.create({
        frequency: RecurrenceFrequency.WEEKLY,
        startDate: new Date('2026-03-24T09:00:00.000Z'),
        maxOccurrences: 3,
        localStartTime: { hour: 9, minute: 0 },
        durationMinutes: 60,
        timezone: 'Europe/London',
      });

      const result = RecurrenceCalculationEngine.calculate({
        seriesId: SERIES_ID,
        pattern,
      });

      expect(result.slots).toHaveLength(3);
      // Pre-DST: 09:00 UTC
      expect(result.slots[0]!.timeRange.start.toISOString()).toBe('2026-03-24T09:00:00.000Z');
      // Post-DST: 08:00 UTC (09:00 BST)
      expect(result.slots[1]!.timeRange.start.toISOString()).toBe('2026-03-31T08:00:00.000Z');
      expect(result.slots[2]!.timeRange.start.toISOString()).toBe('2026-04-07T08:00:00.000Z');
    });

    it('preserves 14:00 PM wall-clock in Australia/Sydney across Southern Hemisphere DST shift (AEST -> AEDT in Oct 2026)', () => {
      // Sydney Spring Forward: First Sunday in October (Oct 4, 2026)
      // Sept 29, 2026 (AEST, UTC+10): 14:00 AEST -> 04:00:00 UTC
      // Oct 6, 2026 (AEDT, UTC+11): 14:00 AEDT -> 03:00:00 UTC
      const pattern = RecurrencePattern.create({
        frequency: RecurrenceFrequency.WEEKLY,
        startDate: new Date('2026-09-29T04:00:00.000Z'),
        maxOccurrences: 3,
        localStartTime: { hour: 14, minute: 0 },
        durationMinutes: 60,
        timezone: 'Australia/Sydney',
      });

      const result = RecurrenceCalculationEngine.calculate({
        seriesId: SERIES_ID,
        pattern,
      });

      expect(result.slots).toHaveLength(3);
      expect(result.slots[0]!.localDate.hour).toBe(14);
      expect(result.slots[0]!.timeRange.start.toISOString()).toBe('2026-09-29T04:00:00.000Z');
      expect(result.slots[1]!.localDate.hour).toBe(14);
      expect(result.slots[1]!.timeRange.start.toISOString()).toBe('2026-10-06T03:00:00.000Z');
    });
  });

  describe('4. Timezone Boundaries & UTC Midnight Shifts', () => {
    it('correctly calculates occurrences in Asia/Tokyo (UTC+9) that cross UTC calendar day boundaries', () => {
      // 08:00 AM JST on Sept 1 (Tuesday) = 23:00 UTC on Aug 31 (Monday)
      const pattern = RecurrencePattern.create({
        frequency: RecurrenceFrequency.WEEKLY,
        startDate: new Date('2026-08-31T23:00:00.000Z'),
        maxOccurrences: 2,
        localStartTime: { hour: 8, minute: 0 },
        durationMinutes: 45,
        timezone: 'Asia/Tokyo',
      });

      const result = RecurrenceCalculationEngine.calculate({
        seriesId: SERIES_ID,
        pattern,
      });

      expect(result.slots).toHaveLength(2);
      expect(result.slots[0]!.localDate).toEqual({
        year: 2026,
        month: 9,
        day: 1,
        hour: 8,
        minute: 0,
      });
      expect(result.slots[0]!.timeRange.start.toISOString()).toBe('2026-08-31T23:00:00.000Z');

      expect(result.slots[1]!.localDate).toEqual({
        year: 2026,
        month: 9,
        day: 8,
        hour: 8,
        minute: 0,
      });
      expect(result.slots[1]!.timeRange.start.toISOString()).toBe('2026-09-07T23:00:00.000Z');
    });
  });

  describe('5. Generation Window Boundaries & Clipping', () => {
    it('only returns slots within the requested window and clips slots before or after window', () => {
      const pattern = RecurrencePattern.create({
        frequency: RecurrenceFrequency.WEEKLY,
        startDate: new Date('2026-09-01T09:00:00.000Z'), // Tuesdays: Sep 1, 8, 15, 22, 29, Oct 6
        maxOccurrences: 10,
        localStartTime: { hour: 9, minute: 0 },
        durationMinutes: 60,
        timezone: 'UTC',
      });

      // Window covering Sep 10 to Sep 25 (Should only include Sep 15 and Sep 22)
      const window = TimeRange.create(
        new Date('2026-09-10T00:00:00.000Z'),
        new Date('2026-09-25T00:00:00.000Z'),
      );

      const result = RecurrenceCalculationEngine.calculate({
        seriesId: SERIES_ID,
        pattern,
        window,
      });

      expect(result.slots).toHaveLength(2);
      expect(result.slots[0]!.occurrenceIndex).toBe(2); // Sep 15
      expect(result.slots[0]!.timeRange.start.toISOString()).toBe('2026-09-15T09:00:00.000Z');
      expect(result.slots[1]!.occurrenceIndex).toBe(3); // Sep 22
      expect(result.slots[1]!.timeRange.start.toISOString()).toBe('2026-09-22T09:00:00.000Z');
    });

    it('marks isSeriesCompleted true when the last occurrence slot is generated within window', () => {
      const pattern = RecurrencePattern.create({
        frequency: RecurrenceFrequency.WEEKLY,
        startDate: new Date('2026-09-01T09:00:00.000Z'),
        maxOccurrences: 3, // Sep 1 (0), Sep 8 (1), Sep 15 (2)
        localStartTime: { hour: 9, minute: 0 },
        durationMinutes: 60,
        timezone: 'UTC',
      });

      const window = TimeRange.create(
        new Date('2026-09-01T00:00:00.000Z'),
        new Date('2026-09-30T00:00:00.000Z'),
      );

      const result = RecurrenceCalculationEngine.calculate({
        seriesId: SERIES_ID,
        pattern,
        window,
      });

      expect(result.slots).toHaveLength(3);
      expect(result.isSeriesCompleted).toBe(true);
    });

    it('strictly respects endDate cutoff even when maxOccurrences is not yet reached', () => {
      const pattern = RecurrencePattern.create({
        frequency: RecurrenceFrequency.WEEKLY,
        startDate: new Date('2026-09-01T09:00:00.000Z'),
        endDate: new Date('2026-09-16T00:00:00.000Z'), // Cuts off before Sep 22
        maxOccurrences: 10,
        localStartTime: { hour: 9, minute: 0 },
        durationMinutes: 60,
        timezone: 'UTC',
      });

      const result = RecurrenceCalculationEngine.calculate({
        seriesId: SERIES_ID,
        pattern,
      });

      expect(result.slots).toHaveLength(3); // Sep 1, Sep 8, Sep 15
      expect(result.isSeriesCompleted).toBe(true);
    });
  });
});
