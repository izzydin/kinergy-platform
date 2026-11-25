import {
  groupConversationsByDate,
  type GroupableConversation,
} from '../utils/conversation-grouping.util';

describe('conversation-grouping.util', () => {
  const referenceDate = new Date('2026-11-24T12:00:00.000Z');

  it('returns empty array when given empty or null list', () => {
    expect(groupConversationsByDate([], referenceDate)).toEqual([]);
    expect(
      groupConversationsByDate(undefined as unknown as GroupableConversation[], referenceDate),
    ).toEqual([]);
  });

  it('correctly categorizes conversations into Hoy, Ayer, Últimos 7 días, and Anteriores', () => {
    const conversations: GroupableConversation[] = [
      {
        id: 'conv-today-1',
        title: 'Consulta Hoy Mañana',
        lastActivityAt: '2026-11-24T10:00:00.000Z', // Today
      },
      {
        id: 'conv-today-2',
        title: 'Consulta Hoy Temprano',
        lastActivityAt: '2026-11-24T05:00:00.000Z', // Today
      },
      {
        id: 'conv-yesterday-1',
        title: 'Consulta Ayer Tarde',
        lastActivityAt: '2026-11-23T16:00:00.000Z', // Yesterday
      },
      {
        id: 'conv-week-1',
        title: 'Consulta Hace 4 Días',
        lastActivityAt: '2026-11-20T11:00:00.000Z', // Previous 7 days
      },
      {
        id: 'conv-older-1',
        title: 'Consulta Hace 2 Semanas',
        lastActivityAt: '2026-11-05T09:00:00.000Z', // Older
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

  it('omits groups that have no items', () => {
    const onlyToday: GroupableConversation[] = [
      {
        id: 'conv-today',
        title: 'Solo Hoy',
        lastActivityAt: '2026-11-24T08:00:00.000Z',
      },
    ];

    const groups = groupConversationsByDate(onlyToday, referenceDate);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.key).toBe('today');
    expect(groups[0]?.items[0]?.id).toBe('conv-today');
  });

  it('preserves input ordering strictly within each group', () => {
    const conversations: GroupableConversation[] = [
      { id: '1', title: 'First', lastActivityAt: '2026-11-24T11:00:00.000Z' },
      { id: '2', title: 'Second', lastActivityAt: '2026-11-24T10:00:00.000Z' },
      { id: '3', title: 'Third', lastActivityAt: '2026-11-24T09:00:00.000Z' },
    ];

    const groups = groupConversationsByDate(conversations, referenceDate);

    expect(groups[0]?.items.map((c) => c.id)).toEqual(['1', '2', '3']);
  });
});
