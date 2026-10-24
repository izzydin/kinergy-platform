/**
 * Authoritative Calendar Date & Facility Timezone Utilities
 *
 * Implements ADR-005: Time and Timezone Strategy:
 * - Authoritative Facility Timezone: "America/New_York"
 * - Prevents DST drift and browser-local time bleeding.
 * - Safely handles midnight-crossing, day boundaries, and month clamping.
 */

export const FACILITY_TIMEZONE = 'America/New_York';

/**
 * Returns today's date formatted as "YYYY-MM-DD" in the facility timezone.
 */
export function getTodayFacilityDate(): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: FACILITY_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date());
}

/**
 * Formats a UTC ISO string as local facility time (e.g. "09:30 AM").
 */
export function formatFacilityTime(isoString: string, options?: { showSeconds?: boolean }): string {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat('en-US', {
    timeZone: FACILITY_TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
    second: options?.showSeconds ? '2-digit' : undefined,
    hour12: true,
  }).format(date);
}

/**
 * Formats a UTC ISO string as a facility date label (e.g. "Oct 24, 2026").
 */
export function formatFacilityDate(
  isoStringOrDateStr: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  if (!isoStringOrDateStr) return '';
  const date = isoStringOrDateStr.includes('T')
    ? new Date(isoStringOrDateStr)
    : new Date(`${isoStringOrDateStr}T12:00:00Z`);

  if (isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat('en-US', {
    timeZone: FACILITY_TIMEZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...options,
  }).format(date);
}

/**
 * Converts a facility-local Date ("YYYY-MM-DD") and local Time ("HH:mm") into a UTC ISO string.
 * Anchored to FACILITY_TIMEZONE ("America/New_York") to prevent browser local timezone drift.
 */
export function facilityDateTimeToUtcIso(dateStr: string, timeStr: string): string {
  if (!dateStr || !timeStr) return '';
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  if (!year || !month || !day || hour === undefined || minute === undefined) return '';

  const targetUtcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: FACILITY_TIMEZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  });

  const parts = formatter.formatToParts(targetUtcGuess);
  const getPart = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const nyYear = getPart('year');
  const nyMonth = getPart('month');
  const nyDay = getPart('day');
  let nyHour = getPart('hour');
  if (nyHour === 24) nyHour = 0;
  const nyMinute = getPart('minute');

  const nyDateAsUtc = new Date(Date.UTC(nyYear, nyMonth - 1, nyDay, nyHour, nyMinute, 0));
  const offsetDiffMs = targetUtcGuess.getTime() - nyDateAsUtc.getTime();

  const correctUtcDate = new Date(targetUtcGuess.getTime() + offsetDiffMs);
  return correctUtcDate.toISOString();
}

/**
 * Adds duration in minutes to a UTC ISO string, returning a new UTC ISO string.
 */
export function addMinutesToIso(isoString: string, minutes: number): string {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '';
  return new Date(date.getTime() + minutes * 60 * 1000).toISOString();
}

/**
 * Parses "YYYY-MM-DD" string into Year, Month (0-indexed), and Day numbers.
 */
export function parseDateString(dateStr: string): { year: number; month: number; day: number } {
  const parts = dateStr.split('-').map(Number);
  return {
    year: parts[0] || 2026,
    month: (parts[1] || 1) - 1,
    day: parts[2] || 1,
  };
}

/**
 * Pads a single digit number with a leading zero.
 */
function pad(num: number): string {
  return num < 10 ? `0${num}` : `${num}`;
}

/**
 * Formats a Year, Month (0-indexed), Day into a clean "YYYY-MM-DD" string.
 */
export function toDateString(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

/**
 * Computes the UTC ISO string for the start of the day (00:00:00.000) in the facility timezone.
 */
export function facilityDayStartToUtcIso(dateStr: string): string {
  return facilityDateTimeToUtcIso(dateStr, '00:00');
}

/**
 * Computes the UTC ISO string for the end of the day (23:59:59.999) in the facility timezone.
 * Anchored to the millisecond immediately preceding 00:00:00 of the subsequent facility calendar day.
 * Correctly accounts for 23h (spring DST), 24h (standard), and 25h (fall DST) days.
 */
export function facilityDayEndToUtcIso(dateStr: string): string {
  const nextDayStr = navigatePeriod(dateStr, 'next', 'day');
  const nextDayStartIso = facilityDateTimeToUtcIso(nextDayStr, '00:00');
  const nextDayStartDate = new Date(nextDayStartIso);
  return new Date(nextDayStartDate.getTime() - 1).toISOString();
}

export interface DayDescriptor {
  dateString: string; // "YYYY-MM-DD"
  dayName: string; // "Mon", "Tue"
  dayNumber: number; // 24
  isToday: boolean;
  isoStart: string; // UTC ISO string start of day in facility timezone
  isoEnd: string; // UTC ISO string end of day in facility timezone
}

/**
 * Computes the 7-day Monday–Sunday week range encompassing the reference date.
 * Both startDate and endDate are authoritative UTC ISO timestamps aligned to facility local midnight.
 */
export function getWeekRange(referenceDateStr: string): {
  startDate: string;
  endDate: string;
  days: DayDescriptor[];
  rangeTitle: string;
} {
  const { year, month, day } = parseDateString(referenceDateStr);
  const anchor = new Date(Date.UTC(year, month, day, 12, 0, 0));
  const dayOfWeek = anchor.getUTCDay(); // 0 is Sunday, 1 is Monday
  const distanceToMonday = (dayOfWeek + 6) % 7; // Monday = 0, Sun = 6

  const mondayUtcTime = anchor.getTime() - distanceToMonday * 24 * 60 * 60 * 1000;
  const todayStr = getTodayFacilityDate();

  const days: DayDescriptor[] = [];
  for (let i = 0; i < 7; i++) {
    const dayDate = new Date(mondayUtcTime + i * 24 * 60 * 60 * 1000);
    const dStr = toDateString(
      dayDate.getUTCFullYear(),
      dayDate.getUTCMonth(),
      dayDate.getUTCDate(),
    );

    const dayName = new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      timeZone: 'UTC',
    }).format(dayDate);

    const isoStart = facilityDayStartToUtcIso(dStr);
    const isoEnd = facilityDayEndToUtcIso(dStr);

    days.push({
      dateString: dStr,
      dayName,
      dayNumber: dayDate.getUTCDate(),
      isToday: dStr === todayStr,
      isoStart,
      isoEnd,
    });
  }

  const startDay = days[0]!;
  const endDay = days[6]!;

  const startLabel = formatFacilityDate(startDay.dateString, { month: 'short', day: 'numeric' });
  const endLabel = formatFacilityDate(endDay.dateString, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return {
    startDate: startDay.isoStart,
    endDate: endDay.isoEnd,
    days,
    rangeTitle: `${startLabel} – ${endLabel}`,
  };
}

/**
 * Computes single-day boundaries for Day view in authoritative facility timezone.
 */
export function getDayRange(referenceDateStr: string): {
  startDate: string;
  endDate: string;
  rangeTitle: string;
  isToday: boolean;
} {
  const isoStart = facilityDayStartToUtcIso(referenceDateStr);
  const isoEnd = facilityDayEndToUtcIso(referenceDateStr);
  const rangeTitle = formatFacilityDate(referenceDateStr, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return {
    startDate: isoStart,
    endDate: isoEnd,
    rangeTitle,
    isToday: referenceDateStr === getTodayFacilityDate(),
  };
}

/**
 * Computes calendar month boundaries for Month view aligned to facility timezone.
 */
export function getMonthRange(referenceDateStr: string): {
  startDate: string;
  endDate: string;
  rangeTitle: string;
  monthGridDays: DayDescriptor[];
} {
  const { year, month } = parseDateString(referenceDateStr);
  const firstOfMonth = new Date(Date.UTC(year, month, 1, 12, 0, 0));
  const lastOfMonth = new Date(Date.UTC(year, month + 1, 0, 12, 0, 0));

  const startWeek = getWeekRange(toDateString(year, month, 1));
  const endWeek = getWeekRange(
    toDateString(lastOfMonth.getUTCFullYear(), lastOfMonth.getUTCMonth(), lastOfMonth.getUTCDate()),
  );

  const rangeTitle = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(firstOfMonth);

  // Generate days between startWeek monday and endWeek sunday
  const startTimestamp = new Date(`${startWeek.days[0]!.dateString}T12:00:00Z`).getTime();
  const endTimestamp = new Date(`${endWeek.days[6]!.dateString}T12:00:00Z`).getTime();
  const todayStr = getTodayFacilityDate();

  const monthGridDays: DayDescriptor[] = [];
  let current = startTimestamp;
  while (current <= endTimestamp) {
    const d = new Date(current);
    const dStr = toDateString(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    const dayName = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(
      d,
    );

    monthGridDays.push({
      dateString: dStr,
      dayName,
      dayNumber: d.getUTCDate(),
      isToday: dStr === todayStr,
      isoStart: facilityDayStartToUtcIso(dStr),
      isoEnd: facilityDayEndToUtcIso(dStr),
    });

    current += 24 * 60 * 60 * 1000;
  }

  return {
    startDate: startWeek.startDate,
    endDate: endWeek.endDate,
    rangeTitle,
    monthGridDays,
  };
}

/**
 * Navigates to previous or next period given current date string and view mode.
 */
export function navigatePeriod(
  currentDateStr: string,
  direction: 'prev' | 'next',
  view: 'day' | 'week' | 'month',
): string {
  const { year, month, day } = parseDateString(currentDateStr);
  const deltaSign = direction === 'next' ? 1 : -1;

  if (view === 'day') {
    const d = new Date(Date.UTC(year, month, day + deltaSign, 12, 0, 0));
    return toDateString(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }

  if (view === 'week') {
    const d = new Date(Date.UTC(year, month, day + deltaSign * 7, 12, 0, 0));
    return toDateString(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }

  // Month navigation
  const targetMonth = month + deltaSign;
  const targetYear = year + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;

  // Clamp to last day of target month if previous day exceeds target month length (e.g. Jan 31 -> Feb 28)
  const daysInTargetMonth = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  const clampedDay = Math.min(day, daysInTargetMonth);

  return toDateString(targetYear, normalizedMonth, clampedDay);
}

/**
 * Calculates top offset % and height % for calendar grid slot rendering.
 */
export function calculateSlotPosition(
  startTimeIso: string,
  endTimeIso: string,
  gridStartHour = 8,
  gridEndHour = 20,
): { topPercent: number; heightPercent: number } {
  const start = new Date(startTimeIso);
  const end = new Date(endTimeIso);

  // Extract facility wall-clock hour and minutes
  const startFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: FACILITY_TIMEZONE,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });

  const startParts = startFormatter.formatToParts(start);

  let startHour = Number(startParts.find((p) => p.type === 'hour')?.value ?? 8);
  if (startHour === 24) startHour = 0;
  const startMinute = Number(startParts.find((p) => p.type === 'minute')?.value ?? 0);

  const totalGridMinutes = (gridEndHour - gridStartHour) * 60;
  const rawStartOffset = (startHour - gridStartHour) * 60 + startMinute;
  const startMinutesFromGridStart = Math.min(totalGridMinutes, Math.max(0, rawStartOffset));

  // Compute duration from physical timestamp difference to gracefully support midnight-crossing
  const durationMs = Math.max(0, end.getTime() - start.getTime());
  const elapsedMinutes = Math.round(durationMs / 60000);

  // If appointment started before grid opening, offset elapsed minutes
  const visibleElapsedMinutes =
    rawStartOffset < 0 ? Math.max(0, elapsedMinutes + rawStartOffset) : elapsedMinutes;
  const endMinutesFromGridStart = Math.min(
    totalGridMinutes,
    startMinutesFromGridStart + visibleElapsedMinutes,
  );

  const durationMinutes = Math.max(15, endMinutesFromGridStart - startMinutesFromGridStart);

  const topPercent = (startMinutesFromGridStart / totalGridMinutes) * 100;
  const heightPercent = (durationMinutes / totalGridMinutes) * 100;

  return {
    topPercent: Math.min(100, Math.max(0, topPercent)),
    heightPercent: Math.min(100 - topPercent, Math.max(2, heightPercent)),
  };
}

/**
 * Parses a "HH:mm" time string into numeric { hour, minute }.
 */
export function parseLocalTimeString(timeStr: string): { hour: number; minute: number } {
  if (!timeStr) return { hour: 9, minute: 0 };
  const parts = timeStr.split(':');
  const hour = parseInt(parts[0] || '9', 10);
  const minute = parseInt(parts[1] || '0', 10);
  return {
    hour: isNaN(hour) ? 9 : Math.max(0, Math.min(23, hour)),
    minute: isNaN(minute) ? 0 : Math.max(0, Math.min(59, minute)),
  };
}

/**
 * Projects recurrence dates for UI preview based on start date, time, and frequency.
 * All preview dates are modeled consistently with RecurrencePattern in @kinergy-platform/core.
 */
export function generateOccurrencePreviewDates(params: {
  startDateStr: string; // YYYY-MM-DD
  timeStr: string; // HH:mm
  frequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
  maxCount?: number;
  endDateStr?: string; // YYYY-MM-DD
}): Array<{ index: number; dateStr: string; displayLabel: string }> {
  const { startDateStr, timeStr, frequency, maxCount = 5, endDateStr } = params;
  if (!startDateStr || !timeStr) return [];

  const [sYear, sMonth, sDay] = startDateStr.split('-').map(Number);
  if (!sYear || !sMonth || !sDay) return [];

  const effectiveEndLimit = endDateStr ? new Date(`${endDateStr}T23:59:59Z`) : undefined;
  const results: Array<{ index: number; dateStr: string; displayLabel: string }> = [];

  let step = 0;
  while (results.length < maxCount && step < 100) {
    let candidateDate: Date;

    if (frequency === 'WEEKLY') {
      const base = new Date(Date.UTC(sYear, sMonth - 1, sDay));
      candidateDate = new Date(base.getTime() + step * 7 * 24 * 60 * 60 * 1000);
    } else if (frequency === 'BIWEEKLY') {
      const base = new Date(Date.UTC(sYear, sMonth - 1, sDay));
      candidateDate = new Date(base.getTime() + step * 14 * 24 * 60 * 60 * 1000);
    } else {
      // MONTHLY with Clamping
      const totalMonths = sMonth - 1 + step;
      const targetYear = sYear + Math.floor(totalMonths / 12);
      const targetMonth = ((totalMonths % 12) + 12) % 12;
      const maxDaysInTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
      const clampedDay = Math.min(sDay, maxDaysInTargetMonth);
      candidateDate = new Date(Date.UTC(targetYear, targetMonth, clampedDay));
    }

    if (effectiveEndLimit && candidateDate.getTime() > effectiveEndLimit.getTime()) {
      break;
    }

    const y = candidateDate.getUTCFullYear();
    const m = String(candidateDate.getUTCMonth() + 1).padStart(2, '0');
    const d = String(candidateDate.getUTCDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;

    const displayLabel = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(candidateDate);

    results.push({
      index: step,
      dateStr,
      displayLabel,
    });

    step++;
  }

  return results;
}
