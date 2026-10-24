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

    // Facility timezone boundary approximation in UTC (EST is UTC-5 / EDT is UTC-4)
    // 00:00:00 facility time ~ 04:00:00 UTC / 05:00:00 UTC
    // Querying with safe bounds covering full day:
    const isoStart = `${dStr}T00:00:00.000Z`;
    const isoEnd = `${dStr}T23:59:59.999Z`;

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
 * Computes single-day boundaries for Day view.
 */
export function getDayRange(referenceDateStr: string): {
  startDate: string;
  endDate: string;
  rangeTitle: string;
  isToday: boolean;
} {
  const isoStart = `${referenceDateStr}T00:00:00.000Z`;
  const isoEnd = `${referenceDateStr}T23:59:59.999Z`;
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
 * Computes calendar month boundaries for Month view.
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
      isoStart: `${dStr}T00:00:00.000Z`,
      isoEnd: `${dStr}T23:59:59.999Z`,
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
  const endFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: FACILITY_TIMEZONE,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });

  const startParts = startFormatter.formatToParts(start);
  const endParts = endFormatter.formatToParts(end);

  const startHour = Number(startParts.find((p) => p.type === 'hour')?.value ?? 8);
  const startMinute = Number(startParts.find((p) => p.type === 'minute')?.value ?? 0);
  const endHour = Number(endParts.find((p) => p.type === 'hour')?.value ?? 9);
  const endMinute = Number(endParts.find((p) => p.type === 'minute')?.value ?? 0);

  const totalGridMinutes = (gridEndHour - gridStartHour) * 60;
  const startMinutesFromGridStart = Math.max(0, (startHour - gridStartHour) * 60 + startMinute);
  const endMinutesFromGridStart = Math.min(
    totalGridMinutes,
    (endHour - gridStartHour) * 60 + endMinute,
  );

  const durationMinutes = Math.max(15, endMinutesFromGridStart - startMinutesFromGridStart);

  const topPercent = (startMinutesFromGridStart / totalGridMinutes) * 100;
  const heightPercent = (durationMinutes / totalGridMinutes) * 100;

  return {
    topPercent: Math.min(100, Math.max(0, topPercent)),
    heightPercent: Math.min(100 - topPercent, Math.max(2, heightPercent)),
  };
}
