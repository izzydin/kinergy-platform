import {
  FACILITY_TIMEZONE,
  calculateSlotPosition,
  formatFacilityDate,
  formatFacilityTime,
  facilityDateTimeToUtcIso,
  addMinutesToIso,
  getDayRange,
  getMonthRange,
  getTodayFacilityDate,
  getWeekRange,
  navigatePeriod,
  parseDateString,
  toDateString,
} from '../calendar-date.utils';

describe('Calendar Date & Facility Timezone Utilities', () => {
  describe('Facility Timezone Constants', () => {
    it('uses America/New_York as authoritative facility timezone', () => {
      expect(FACILITY_TIMEZONE).toBe('America/New_York');
    });

    it('returns today as a valid YYYY-MM-DD string', () => {
      const today = getTodayFacilityDate();
      expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('formatFacilityTime', () => {
    it('formats UTC ISO strings in facility timezone (EDT is UTC-4 in October)', () => {
      // 14:00 UTC = 10:00 AM EDT (America/New_York)
      const formatted = formatFacilityTime('2026-10-24T14:00:00.000Z');
      expect(formatted).toBe('10:00 AM');
    });

    it('formats afternoon facility times correctly', () => {
      // 19:30 UTC = 3:30 PM EDT
      const formatted = formatFacilityTime('2026-10-24T19:30:00.000Z');
      expect(formatted).toBe('3:30 PM');
    });

    it('returns empty string for invalid dates', () => {
      expect(formatFacilityTime('')).toBe('');
      expect(formatFacilityTime('invalid-date')).toBe('');
    });
  });

  describe('formatFacilityDate', () => {
    it('formats a date string into readable format in facility timezone', () => {
      const formatted = formatFacilityDate('2026-10-24');
      expect(formatted).toContain('Oct 24, 2026');
    });

    it('formats an ISO timestamp string into readable date', () => {
      const formatted = formatFacilityDate('2026-10-24T14:00:00.000Z');
      expect(formatted).toContain('Oct 24, 2026');
    });

    it('returns empty string for empty input', () => {
      expect(formatFacilityDate('')).toBe('');
    });
  });

  describe('facilityDateTimeToUtcIso and addMinutesToIso', () => {
    it('converts facility-local date and time to UTC ISO string in EDT (UTC-4)', () => {
      // 10:00 AM EDT on Oct 24, 2026 is 14:00:00 UTC
      const utcIso = facilityDateTimeToUtcIso('2026-10-24', '10:00');
      expect(utcIso).toBe('2026-10-24T14:00:00.000Z');
      expect(formatFacilityTime(utcIso)).toBe('10:00 AM');
    });

    it('converts facility-local date and time to UTC ISO string in EST (UTC-5 in January)', () => {
      // 10:00 AM EST on Jan 15, 2026 is 15:00:00 UTC
      const utcIso = facilityDateTimeToUtcIso('2026-01-15', '10:00');
      expect(utcIso).toBe('2026-01-15T15:00:00.000Z');
      expect(formatFacilityTime(utcIso)).toBe('10:00 AM');
    });

    it('adds minutes accurately to UTC ISO string', () => {
      const start = '2026-10-24T14:00:00.000Z';
      const end = addMinutesToIso(start, 60);
      expect(end).toBe('2026-10-24T15:00:00.000Z');
      expect(formatFacilityTime(end)).toBe('11:00 AM');
    });

    it('handles empty inputs safely', () => {
      expect(facilityDateTimeToUtcIso('', '')).toBe('');
      expect(addMinutesToIso('', 60)).toBe('');
    });
  });

  describe('parseDateString and toDateString', () => {
    it('parses YYYY-MM-DD into numbers (with 0-indexed month)', () => {
      const parsed = parseDateString('2026-10-24');
      expect(parsed).toEqual({ year: 2026, month: 9, day: 24 });
    });

    it('formats year, month, day into padded YYYY-MM-DD string', () => {
      expect(toDateString(2026, 9, 24)).toBe('2026-10-24');
      expect(toDateString(2026, 0, 5)).toBe('2026-01-05');
    });
  });

  describe('getWeekRange', () => {
    it('computes 7-day Monday to Sunday week range containing reference date', () => {
      // 2026-10-24 is a Saturday
      const week = getWeekRange('2026-10-24');
      expect(week.days).toHaveLength(7);
      expect(week.days[0]!.dayName).toBe('Mon');
      expect(week.days[0]!.dateString).toBe('2026-10-19');
      expect(week.days[6]!.dayName).toBe('Sun');
      expect(week.days[6]!.dateString).toBe('2026-10-25');
      expect(week.rangeTitle).toContain('Oct 19');
      expect(week.rangeTitle).toContain('Oct 25, 2026');
      expect(week.startDate).toContain('2026-10-19T00:00:00.000Z');
      expect(week.endDate).toContain('2026-10-25T23:59:59.999Z');
    });
  });

  describe('getDayRange', () => {
    it('computes single day boundaries in UTC', () => {
      const day = getDayRange('2026-10-24');
      expect(day.startDate).toBe('2026-10-24T00:00:00.000Z');
      expect(day.endDate).toBe('2026-10-24T23:59:59.999Z');
      expect(day.rangeTitle).toContain('October 24, 2026');
    });
  });

  describe('getMonthRange', () => {
    it('computes complete calendar month grid boundaries starting on Monday', () => {
      const month = getMonthRange('2026-10-24');
      expect(month.rangeTitle).toBe('October 2026');
      expect(month.monthGridDays.length).toBeGreaterThanOrEqual(28);
      // First day of grid is Monday
      expect(month.monthGridDays[0]!.dayName).toBe('Mon');
      // Last day of grid is Sunday
      expect(month.monthGridDays[month.monthGridDays.length - 1]!.dayName).toBe('Sun');
    });
  });

  describe('navigatePeriod', () => {
    it('navigates days forward and backward', () => {
      expect(navigatePeriod('2026-10-24', 'next', 'day')).toBe('2026-10-25');
      expect(navigatePeriod('2026-10-24', 'prev', 'day')).toBe('2026-10-23');
      // Cross month boundary
      expect(navigatePeriod('2026-10-31', 'next', 'day')).toBe('2026-11-01');
      expect(navigatePeriod('2026-11-01', 'prev', 'day')).toBe('2026-10-31');
    });

    it('navigates weeks forward and backward by 7 days', () => {
      expect(navigatePeriod('2026-10-24', 'next', 'week')).toBe('2026-10-31');
      expect(navigatePeriod('2026-10-24', 'prev', 'week')).toBe('2026-10-17');
    });

    it('navigates months forward and backward with day clamping', () => {
      expect(navigatePeriod('2026-10-15', 'next', 'month')).toBe('2026-11-15');
      expect(navigatePeriod('2026-10-15', 'prev', 'month')).toBe('2026-09-15');
      // Clamping: Oct 31 -> Nov 30 (Nov has 30 days)
      expect(navigatePeriod('2026-10-31', 'next', 'month')).toBe('2026-11-30');
      // Clamping: Jan 31 -> Feb 28
      expect(navigatePeriod('2026-01-31', 'next', 'month')).toBe('2026-02-28');
    });
  });

  describe('calculateSlotPosition', () => {
    it('calculates top and height percentage for 8am-8pm grid (12 hours = 720 minutes)', () => {
      // 10:00 AM EDT is 2 hours (120 mins) into an 8am start (120/720 = 16.67%)
      // 10:00 AM to 11:00 AM is 1 hour (60 mins) duration (60/720 = 8.33%)
      // 10:00 AM EDT = 14:00 UTC
      // 11:00 AM EDT = 15:00 UTC
      const { topPercent, heightPercent } = calculateSlotPosition(
        '2026-10-24T14:00:00.000Z',
        '2026-10-24T15:00:00.000Z',
        8,
        20,
      );

      expect(topPercent).toBeCloseTo(16.67, 1);
      expect(heightPercent).toBeCloseTo(8.33, 1);
    });

    it('clamps slot within bounds if start or end exceeds visible hours', () => {
      // 7:00 AM EDT (before 8:00 AM grid start)
      const { topPercent } = calculateSlotPosition(
        '2026-10-24T11:00:00.000Z', // 7am EDT
        '2026-10-24T13:00:00.000Z', // 9am EDT
        8,
        20,
      );

      expect(topPercent).toBe(0);
    });
  });
});
