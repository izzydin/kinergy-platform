/**
 * Grouping keys for chronological conversation history presentation.
 */
export type ConversationDateGroupKey = 'today' | 'yesterday' | 'previous7Days' | 'older';

/**
 * A chronological group of conversation summaries.
 */
export interface ConversationDateGroup<T> {
  readonly key: ConversationDateGroupKey;
  readonly label: string;
  readonly items: readonly T[];
}

/**
 * Generic item representation accepted by groupConversationsByDate.
 */
export interface GroupableConversation {
  readonly id: string;
  readonly title: string;
  readonly lastActivityAt?: string;
  readonly updatedAt?: string;
  readonly createdAt?: string;
}

/**
 * Helper to compute midnight (00:00:00.000) for a given reference date and day offset.
 *
 * Avoids fragile elapsed millisecond subtraction (which fails across Daylight Saving Time transitions).
 *
 * @param date Base date reference.
 * @param offsetDays Days to offset relative to the base date (e.g. 0 for today, -1 for yesterday, -7 for 7 days ago).
 * @param timezone Optional IANA timezone identifier. If omitted, uses runtime's local timezone.
 * @returns Epoch millisecond timestamp of midnight (start of day).
 */
export function getStartOfDay(date: Date, offsetDays: number, timezone?: string): number {
  if (!timezone) {
    return new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate() + offsetDays,
      0,
      0,
      0,
      0,
    ).getTime();
  }

  if (timezone.toUpperCase() === 'UTC') {
    return Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() + offsetDays,
      0,
      0,
      0,
      0,
    );
  }

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });
  const parts = formatter.formatToParts(date);
  const getPart = (type: string): number => {
    const p = parts.find((pt) => pt.type === type);
    return p ? parseInt(p.value, 10) : 0;
  };
  const year = getPart('year');
  const month = getPart('month') - 1;
  const day = getPart('day') + offsetDays;

  const utcMidnight = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
  const tzParts = formatter.formatToParts(utcMidnight);
  const locYear = parseInt(tzParts.find((p) => p.type === 'year')?.value || '0', 10);
  const locMonth = parseInt(tzParts.find((p) => p.type === 'month')?.value || '0', 10) - 1;
  const locDay = parseInt(tzParts.find((p) => p.type === 'day')?.value || '0', 10);
  const hourFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  });
  const timeParts = hourFormatter.formatToParts(utcMidnight);
  let locHour = parseInt(timeParts.find((p) => p.type === 'hour')?.value || '0', 10);
  if (locHour === 24) locHour = 0;
  const locMinute = parseInt(timeParts.find((p) => p.type === 'minute')?.value || '0', 10);
  const locSecond = parseInt(timeParts.find((p) => p.type === 'second')?.value || '0', 10);

  const offsetMs =
    Date.UTC(locYear, locMonth, locDay, locHour, locMinute, locSecond) -
    Date.UTC(year, month, day, 0, 0, 0);

  return utcMidnight.getTime() - offsetMs;
}

/**
 * Groups an ordered array of conversations into human-meaningful date groups.
 *
 * Guarantees:
 * - Preserves the authoritative server ordering (lastActivityAt DESC) within each group.
 * - Only includes groups that contain at least one conversation.
 * - Uses local calendar day boundaries based on the reference time (defaults to Date.now()).
 * - Does not invent or alter conversation fields.
 *
 * @param conversations Pre-sorted conversations array.
 * @param now Optional reference date for deterministic testing.
 * @param timezone Optional IANA timezone identifier (e.g. 'UTC', 'America/New_York'). Defaults to user's local timezone.
 */
export function groupConversationsByDate<T extends GroupableConversation>(
  conversations: readonly T[],
  now: Date = new Date(),
  timezone?: string,
): readonly ConversationDateGroup<T>[] {
  if (!conversations || conversations.length === 0) {
    return [];
  }

  const validNow = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();

  // Calculate calendar day boundaries (midnight 00:00:00.000)
  const startOfToday = getStartOfDay(validNow, 0, timezone);
  const startOfYesterday = getStartOfDay(validNow, -1, timezone);
  const startOfSevenDaysAgo = getStartOfDay(validNow, -7, timezone);

  const todayItems: T[] = [];
  const yesterdayItems: T[] = [];
  const previous7DaysItems: T[] = [];
  const olderItems: T[] = [];

  for (const item of conversations) {
    const rawDate = item.lastActivityAt || item.updatedAt || item.createdAt;
    const time = rawDate ? new Date(rawDate).getTime() : NaN;

    if (Number.isNaN(time)) {
      olderItems.push(item);
      continue;
    }

    if (time >= startOfToday) {
      todayItems.push(item);
    } else if (time >= startOfYesterday) {
      yesterdayItems.push(item);
    } else if (time >= startOfSevenDaysAgo) {
      previous7DaysItems.push(item);
    } else {
      olderItems.push(item);
    }
  }

  const groups: ConversationDateGroup<T>[] = [];

  if (todayItems.length > 0) {
    groups.push({ key: 'today', label: 'Hoy', items: todayItems });
  }
  if (yesterdayItems.length > 0) {
    groups.push({ key: 'yesterday', label: 'Ayer', items: yesterdayItems });
  }
  if (previous7DaysItems.length > 0) {
    groups.push({ key: 'previous7Days', label: 'Últimos 7 días', items: previous7DaysItems });
  }
  if (olderItems.length > 0) {
    groups.push({ key: 'older', label: 'Anteriores', items: olderItems });
  }

  return groups;
}
