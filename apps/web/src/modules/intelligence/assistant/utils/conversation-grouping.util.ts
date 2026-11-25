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
 */
export function groupConversationsByDate<T extends GroupableConversation>(
  conversations: readonly T[],
  now: Date = new Date(),
): readonly ConversationDateGroup<T>[] {
  if (!conversations || conversations.length === 0) {
    return [];
  }

  // Calculate local calendar day boundaries
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
  const startOfSevenDaysAgo = startOfToday - 7 * 24 * 60 * 60 * 1000;

  const todayItems: T[] = [];
  const yesterdayItems: T[] = [];
  const previous7DaysItems: T[] = [];
  const olderItems: T[] = [];

  for (const item of conversations) {
    const rawDate = item.lastActivityAt || item.updatedAt || item.createdAt;
    const time = rawDate ? new Date(rawDate).getTime() : 0;

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
