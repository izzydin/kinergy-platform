import {
  groupConversationsByDate,
  getStartOfDay,
  type GroupableConversation,
} from '../utils/conversation-grouping.util';

describe('conversation-grouping.util', () => {
  // Fixed local reference date: Wednesday, Nov 25, 2026 at 14:00:00
  const referenceDate = new Date(2026, 10, 25, 14, 0, 0);

  it('1. returns empty array when given empty or null list', () => {
    expect(groupConversationsByDate([], referenceDate)).toEqual([]);
    expect(
      groupConversationsByDate(undefined as unknown as GroupableConversation[], referenceDate),
    ).toEqual([]);
  });

  it('2. correctly categorizes conversations into Hoy, Ayer, Últimos 7 días, and Anteriores', () => {
    const refYear = referenceDate.getFullYear();
    const refMonth = referenceDate.getMonth();
    const refDay = referenceDate.getDate();

    const conversations: GroupableConversation[] = [
      {
        id: 'conv-today-1',
        title: 'Consulta Hoy Mañana',
        lastActivityAt: new Date(refYear, refMonth, refDay, 10, 0, 0).toISOString(),
      },
      {
        id: 'conv-today-2',
        title: 'Consulta Hoy Temprano',
        lastActivityAt: new Date(refYear, refMonth, refDay, 5, 0, 0).toISOString(),
      },
      {
        id: 'conv-yesterday-1',
        title: 'Consulta Ayer Tarde',
        lastActivityAt: new Date(refYear, refMonth, refDay - 1, 16, 0, 0).toISOString(),
      },
      {
        id: 'conv-week-1',
        title: 'Consulta Hace 4 Días',
        lastActivityAt: new Date(refYear, refMonth, refDay - 4, 11, 0, 0).toISOString(),
      },
      {
        id: 'conv-older-1',
        title: 'Consulta Hace 2 Semanas',
        lastActivityAt: new Date(refYear, refMonth, refDay - 14, 9, 0, 0).toISOString(),
      },
    ];

    const groups = groupConversationsByDate(conversations, referenceDate);

    expect(groups).toHaveLength(4);

    expect(groups[0]?.key).toBe('today');
    expect(groups[0]?.label).toBe('Hoy');
    expect(groups[0]?.items).toHaveLength(2);
    expect(groups[0]?.items[0]?.id).toBe('conv-today-1');
    expect(groups[0]?.items[1]?.id).toBe('conv-today-2');

    expect(groups[1]?.key).toBe('yesterday');
    expect(groups[1]?.label).toBe('Ayer');
    expect(groups[1]?.items).toHaveLength(1);
    expect(groups[1]?.items[0]?.id).toBe('conv-yesterday-1');

    expect(groups[2]?.key).toBe('previous7Days');
    expect(groups[2]?.label).toBe('Últimos 7 días');
    expect(groups[2]?.items).toHaveLength(1);
    expect(groups[2]?.items[0]?.id).toBe('conv-week-1');

    expect(groups[3]?.key).toBe('older');
    expect(groups[3]?.label).toBe('Anteriores');
    expect(groups[3]?.items).toHaveLength(1);
    expect(groups[3]?.items[0]?.id).toBe('conv-older-1');
  });

  it('3. handles edge boundaries close to midnight precisely without elapsed millisecond drift', () => {
    const refYear = referenceDate.getFullYear();
    const refMonth = referenceDate.getMonth();
    const refDay = referenceDate.getDate();

    const conversations: GroupableConversation[] = [
      {
        id: 'conv-today-start',
        title: 'Exactamente medianoche hoy',
        lastActivityAt: new Date(refYear, refMonth, refDay, 0, 0, 0, 0).toISOString(),
      },
      {
        id: 'conv-yesterday-end',
        title: 'Un milisegundo antes de medianoche hoy',
        lastActivityAt: new Date(
          new Date(refYear, refMonth, refDay, 0, 0, 0, 0).getTime() - 1,
        ).toISOString(),
      },
      {
        id: 'conv-yesterday-start',
        title: 'Exactamente medianoche ayer',
        lastActivityAt: new Date(refYear, refMonth, refDay - 1, 0, 0, 0, 0).toISOString(),
      },
      {
        id: 'conv-week-start-edge',
        title: 'Un milisegundo antes de medianoche ayer (hace 2 días)',
        lastActivityAt: new Date(
          new Date(refYear, refMonth, refDay - 1, 0, 0, 0, 0).getTime() - 1,
        ).toISOString(),
      },
      {
        id: 'conv-seven-days-ago-exact',
        title: 'Exactamente inicio del día 7 anterior',
        lastActivityAt: new Date(refYear, refMonth, refDay - 7, 0, 0, 0, 0).toISOString(),
      },
      {
        id: 'conv-older-edge',
        title: 'Un milisegundo antes del día 7 (hace 8 días)',
        lastActivityAt: new Date(
          new Date(refYear, refMonth, refDay - 7, 0, 0, 0, 0).getTime() - 1,
        ).toISOString(),
      },
    ];

    const groups = groupConversationsByDate(conversations, referenceDate);

    expect(groups).toHaveLength(4);
    expect(groups.find((g) => g.key === 'today')?.items.map((i) => i.id)).toEqual([
      'conv-today-start',
    ]);
    expect(groups.find((g) => g.key === 'yesterday')?.items.map((i) => i.id)).toEqual([
      'conv-yesterday-end',
      'conv-yesterday-start',
    ]);
    expect(groups.find((g) => g.key === 'previous7Days')?.items.map((i) => i.id)).toEqual([
      'conv-week-start-edge',
      'conv-seven-days-ago-exact',
    ]);
    expect(groups.find((g) => g.key === 'older')?.items.map((i) => i.id)).toEqual([
      'conv-older-edge',
    ]);
  });

  it('4. correctly handles UTC timestamp that falls on a different local calendar day', () => {
    // Explicitly test in UTC mode to verify cross-day behavior
    const utcReferenceDate = new Date('2026-11-25T15:00:00.000Z');

    const conversations: GroupableConversation[] = [
      {
        id: 'conv-utc-today',
        title: 'Created at 00:01Z on Nov 25',
        lastActivityAt: '2026-11-25T00:01:00.000Z',
      },
      {
        id: 'conv-utc-yesterday',
        title: 'Created at 23:59Z on Nov 24',
        lastActivityAt: '2026-11-24T23:59:00.000Z',
      },
    ];

    const groups = groupConversationsByDate(conversations, utcReferenceDate, 'UTC');

    expect(groups).toHaveLength(2);
    expect(groups[0]?.key).toBe('today');
    expect(groups[0]?.items[0]?.id).toBe('conv-utc-today');
    expect(groups[1]?.key).toBe('yesterday');
    expect(groups[1]?.items[0]?.id).toBe('conv-utc-yesterday');
  });

  it('5. omits groups that have no items', () => {
    const onlyToday: GroupableConversation[] = [
      {
        id: 'conv-today',
        title: 'Solo Hoy',
        lastActivityAt: new Date(referenceDate.getTime() - 60000).toISOString(),
      },
    ];

    const groups = groupConversationsByDate(onlyToday, referenceDate);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.key).toBe('today');
    expect(groups[0]?.items[0]?.id).toBe('conv-today');
  });

  it('6. preserves input ordering strictly within each group', () => {
    const refYear = referenceDate.getFullYear();
    const refMonth = referenceDate.getMonth();
    const refDay = referenceDate.getDate();

    const conversations: GroupableConversation[] = [
      {
        id: '1',
        title: 'First',
        lastActivityAt: new Date(refYear, refMonth, refDay, 11, 0, 0).toISOString(),
      },
      {
        id: '2',
        title: 'Second',
        lastActivityAt: new Date(refYear, refMonth, refDay, 10, 0, 0).toISOString(),
      },
      {
        id: '3',
        title: 'Third',
        lastActivityAt: new Date(refYear, refMonth, refDay, 9, 0, 0).toISOString(),
      },
    ];

    const groups = groupConversationsByDate(conversations, referenceDate);

    expect(groups[0]?.items.map((c) => c.id)).toEqual(['1', '2', '3']);
  });

  it('7. handles invalid or missing timestamps gracefully by placing them in older', () => {
    const conversations: GroupableConversation[] = [
      { id: 'invalid-date', title: 'Invalid date string', lastActivityAt: 'not-a-date' },
      { id: 'missing-date', title: 'No dates provided' },
    ];

    const groups = groupConversationsByDate(conversations, referenceDate);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.key).toBe('older');
    expect(groups[0]?.items.map((c) => c.id)).toEqual(['invalid-date', 'missing-date']);
  });

  it('8. demonstrates deterministic behavior when system date changes', () => {
    const refYear = referenceDate.getFullYear();
    const refMonth = referenceDate.getMonth();
    const refDay = referenceDate.getDate();

    const conversationTimestamp = new Date(refYear, refMonth, refDay, 10, 0, 0).toISOString();
    const conversations: GroupableConversation[] = [
      { id: 'moving-conv', title: 'Conversation that ages', lastActivityAt: conversationTimestamp },
    ];

    // Day 1: Created today
    const groupsDay1 = groupConversationsByDate(conversations, referenceDate);
    expect(groupsDay1[0]?.key).toBe('today');
    expect(groupsDay1[0]?.label).toBe('Hoy');

    // Day 2 (tomorrow): Same conversation is now yesterday
    const tomorrow = new Date(refYear, refMonth, refDay + 1, 14, 0, 0);
    const groupsDay2 = groupConversationsByDate(conversations, tomorrow);
    expect(groupsDay2[0]?.key).toBe('yesterday');
    expect(groupsDay2[0]?.label).toBe('Ayer');

    // Day 5: Same conversation is now in Últimos 7 días
    const day5 = new Date(refYear, refMonth, refDay + 4, 14, 0, 0);
    const groupsDay5 = groupConversationsByDate(conversations, day5);
    expect(groupsDay5[0]?.key).toBe('previous7Days');
    expect(groupsDay5[0]?.label).toBe('Últimos 7 días');

    // Day 10: Same conversation is now in Anteriores
    const day10 = new Date(refYear, refMonth, refDay + 9, 14, 0, 0);
    const groupsDay10 = groupConversationsByDate(conversations, day10);
    expect(groupsDay10[0]?.key).toBe('older');
    expect(groupsDay10[0]?.label).toBe('Anteriores');
  });

  it('9. getStartOfDay correctly calculates midnight across IANA timezones and offsets', () => {
    const testDate = new Date('2026-11-25T12:00:00.000Z');
    const startUtc = getStartOfDay(testDate, 0, 'UTC');
    expect(new Date(startUtc).toISOString()).toBe('2026-11-25T00:00:00.000Z');

    const startYesterdayUtc = getStartOfDay(testDate, -1, 'UTC');
    expect(new Date(startYesterdayUtc).toISOString()).toBe('2026-11-24T00:00:00.000Z');

    const startWeekUtc = getStartOfDay(testDate, -7, 'UTC');
    expect(new Date(startWeekUtc).toISOString()).toBe('2026-11-18T00:00:00.000Z');
  });
});
