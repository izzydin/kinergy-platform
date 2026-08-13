export interface LocalDateParts {
  readonly year: number;
  readonly monthZeroBased: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
}

/**
 * Pure Domain Timezone and Temporal Conversion Utility.
 * Adheres to ADR-005 (UTC Normalization & IANA Timezone Handling).
 */
export class TimezoneUtil {
  /**
   * Returns the last day (28, 29, 30, 31) of a zero-based month for a given year.
   */
  public static getLastDayOfMonth(year: number, monthZeroBased: number): number {
    return new Date(Date.UTC(year, monthZeroBased + 1, 0)).getUTCDate();
  }

  /**
   * Extracts local calendar date and time parts from a UTC Date in a given IANA timezone.
   */
  public static extractLocalDate(date: Date, timezone: string = 'UTC'): LocalDateParts {
    if (!timezone || timezone.toUpperCase() === 'UTC') {
      return {
        year: date.getUTCFullYear(),
        monthZeroBased: date.getUTCMonth(),
        day: date.getUTCDate(),
        hour: date.getUTCHours(),
        minute: date.getUTCMinutes(),
      };
    }

    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(date);
    const getPart = (type: string): number => {
      const p = parts.find((pt) => pt.type === type);
      return p ? parseInt(p.value, 10) : 0;
    };

    let hour = getPart('hour');
    if (hour === 24) hour = 0;

    return {
      year: getPart('year'),
      monthZeroBased: getPart('month') - 1,
      day: getPart('day'),
      hour,
      minute: getPart('minute'),
    };
  }

  /**
   * Converts local calendar date and time in a given IANA timezone into a UTC Date.
   * Accurately handles Standard Time vs Daylight Saving Time (DST) offsets.
   */
  public static localToUtc(
    year: number,
    monthZeroBased: number,
    day: number,
    hour: number,
    minute: number,
    timezone: string = 'UTC',
  ): Date {
    if (!timezone || timezone.toUpperCase() === 'UTC') {
      return new Date(Date.UTC(year, monthZeroBased, day, hour, minute, 0, 0));
    }

    const utcGuess = new Date(Date.UTC(year, monthZeroBased, day, hour, minute, 0, 0));

    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(utcGuess);
    const getPart = (type: string): number => {
      const p = parts.find((pt) => pt.type === type);
      return p ? parseInt(p.value, 10) : 0;
    };

    const locYear = getPart('year');
    const locMonth = getPart('month') - 1;
    const locDay = getPart('day');
    let locHour = getPart('hour');
    if (locHour === 24) locHour = 0;
    const locMinute = getPart('minute');

    const locTimestamp = Date.UTC(locYear, locMonth, locDay, locHour, locMinute, 0, 0);
    const offset = locTimestamp - utcGuess.getTime();

    const targetUtc = new Date(utcGuess.getTime() - offset);
    return targetUtc;
  }
}
