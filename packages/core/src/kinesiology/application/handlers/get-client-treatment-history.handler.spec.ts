import { GetClientTreatmentHistoryHandler } from './get-client-treatment-history.handler';
import { GetClientTreatmentHistoryQuery } from '../queries/get-client-treatment-history.query';
import {
  ITreatmentSessionRepository,
  TreatmentHistoryFilter,
} from '../../domain/repositories/treatment-session.repository';
import { SessionStatus } from '../../domain/treatment-session/session-status.enum';
import {
  PaginatedTreatmentHistoryDTO,
  TreatmentHistorySummaryDTO,
} from '../dtos/treatment-history-summary.dto';
import { TreatmentSession } from '../../domain/treatment-session/treatment-session.aggregate';
import { SessionId } from '../../domain/treatment-session/session-id.vo';

class MockTreatmentSessionRepository implements ITreatmentSessionRepository {
  public historyRecords: TreatmentHistorySummaryDTO[] = [];

  async findById(_id: SessionId): Promise<TreatmentSession | null> {
    return null;
  }

  async findByAppointmentId(_appointmentId: string): Promise<TreatmentSession | null> {
    return null;
  }

  async save(_session: TreatmentSession): Promise<void> {}

  async findHistoryByClientId(
    clientId: string,
    filter: TreatmentHistoryFilter,
  ): Promise<PaginatedTreatmentHistoryDTO> {
    let filtered = this.historyRecords.filter((r) => r.clientId === clientId);

    if (filter.status) {
      filtered = filtered.filter((r) => r.status === filter.status);
    }
    if (filter.therapistId) {
      filtered = filtered.filter((r) => r.therapistId === filter.therapistId);
    }
    if (filter.dateFrom) {
      filtered = filtered.filter(
        (r) => new Date(r.createdAt).getTime() >= filter.dateFrom!.getTime(),
      );
    }
    if (filter.dateTo) {
      filtered = filtered.filter(
        (r) => new Date(r.createdAt).getTime() <= filter.dateTo!.getTime(),
      );
    }

    // Deterministic sorting: createdAt DESC, sessionId DESC
    filtered.sort((a, b) => {
      const dateComparison = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (dateComparison !== 0) return dateComparison;
      return b.sessionId.localeCompare(a.sessionId);
    });

    const total = filtered.length;
    const page = filter.pagination.page;
    const limit = filter.pagination.limit;
    const offset = (page - 1) * limit;
    const items = filtered.slice(offset, offset + limit);
    const totalPages = Math.ceil(total / limit);

    return {
      items,
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    };
  }
}

describe('GetClientTreatmentHistoryHandler', () => {
  let repository: MockTreatmentSessionRepository;
  let handler: GetClientTreatmentHistoryHandler;

  beforeEach(() => {
    repository = new MockTreatmentSessionRepository();
    handler = new GetClientTreatmentHistoryHandler(repository);
  });

  const createSummaryRecord = (
    overrides?: Partial<TreatmentHistorySummaryDTO>,
  ): TreatmentHistorySummaryDTO => ({
    sessionId: overrides?.sessionId ?? `sess_${Math.random().toString(36).substring(2, 7)}`,
    clientId: overrides?.clientId ?? 'client_100',
    appointmentId: overrides?.appointmentId ?? 'appt_200',
    therapistId: overrides?.therapistId ?? 'therapist_300',
    status: overrides?.status ?? SessionStatus.COMPLETED,
    notesSummary: overrides?.notesSummary ?? 'Cervical mobility restored.',
    hasFullNotes: overrides?.hasFullNotes ?? true,
    version: overrides?.version ?? 3,
    createdAt: overrides?.createdAt ?? new Date('2026-08-10T10:00:00.000Z').toISOString(),
    updatedAt: overrides?.updatedAt ?? new Date('2026-08-10T11:00:00.000Z').toISOString(),
  });

  it('should return empty pagination result when client has no treatment history', async () => {
    const query = new GetClientTreatmentHistoryQuery({
      clientId: 'client_empty',
    });

    const result = await handler.execute(query);

    expect(result.isSuccess).toBe(true);
    const data = result.getValue();
    expect(data.items).toEqual([]);
    expect(data.total).toBe(0);
    expect(data.page).toBe(1);
    expect(data.limit).toBe(20);
    expect(data.totalPages).toBe(0);
    expect(data.hasNextPage).toBe(false);
    expect(data.hasPreviousPage).toBe(false);
  });

  it('should return paginated history with deterministic ordering (createdAt DESC, sessionId DESC)', async () => {
    repository.historyRecords = [
      createSummaryRecord({
        sessionId: 'sess_1',
        createdAt: '2026-08-01T10:00:00.000Z',
      }),
      createSummaryRecord({
        sessionId: 'sess_2',
        createdAt: '2026-08-05T10:00:00.000Z',
      }),
      createSummaryRecord({
        sessionId: 'sess_3',
        createdAt: '2026-08-05T10:00:00.000Z', // Identical date to test tie-breaker
      }),
    ];

    const query = new GetClientTreatmentHistoryQuery({
      clientId: 'client_100',
      page: 1,
      limit: 10,
    });

    const result = await handler.execute(query);

    expect(result.isSuccess).toBe(true);
    const data = result.getValue();
    expect(data.total).toBe(3);
    expect(data.items).toHaveLength(3);
    // sess_3 and sess_2 have same date, sess_3 comes first due to id DESC tie-breaker
    expect(data.items[0]!.sessionId).toBe('sess_3');
    expect(data.items[1]!.sessionId).toBe('sess_2');
    expect(data.items[2]!.sessionId).toBe('sess_1');
  });

  it('should correctly filter by session status', async () => {
    repository.historyRecords = [
      createSummaryRecord({
        sessionId: 'sess_comp',
        status: SessionStatus.COMPLETED,
      }),
      createSummaryRecord({
        sessionId: 'sess_inprog',
        status: SessionStatus.IN_PROGRESS,
      }),
      createSummaryRecord({
        sessionId: 'sess_sched',
        status: SessionStatus.SCHEDULED,
      }),
    ];

    const query = new GetClientTreatmentHistoryQuery({
      clientId: 'client_100',
      status: SessionStatus.COMPLETED,
    });

    const result = await handler.execute(query);

    expect(result.isSuccess).toBe(true);
    const data = result.getValue();
    expect(data.total).toBe(1);
    expect(data.items[0]!.sessionId).toBe('sess_comp');
  });

  it('should correctly filter by therapist ID', async () => {
    repository.historyRecords = [
      createSummaryRecord({
        sessionId: 'sess_t1',
        therapistId: 'therapist_dr_smith',
      }),
      createSummaryRecord({
        sessionId: 'sess_t2',
        therapistId: 'therapist_dr_jones',
      }),
    ];

    const query = new GetClientTreatmentHistoryQuery({
      clientId: 'client_100',
      therapistId: 'therapist_dr_smith',
    });

    const result = await handler.execute(query);

    expect(result.isSuccess).toBe(true);
    const data = result.getValue();
    expect(data.total).toBe(1);
    expect(data.items[0]!.sessionId).toBe('sess_t1');
  });

  it('should correctly filter by date range', async () => {
    repository.historyRecords = [
      createSummaryRecord({
        sessionId: 'sess_july',
        createdAt: '2026-07-15T10:00:00.000Z',
      }),
      createSummaryRecord({
        sessionId: 'sess_aug_early',
        createdAt: '2026-08-05T10:00:00.000Z',
      }),
      createSummaryRecord({
        sessionId: 'sess_aug_late',
        createdAt: '2026-08-25T10:00:00.000Z',
      }),
    ];

    const query = new GetClientTreatmentHistoryQuery({
      clientId: 'client_100',
      dateFrom: new Date('2026-08-01T00:00:00.000Z'),
      dateTo: new Date('2026-08-10T23:59:59.999Z'),
    });

    const result = await handler.execute(query);

    expect(result.isSuccess).toBe(true);
    const data = result.getValue();
    expect(data.total).toBe(1);
    expect(data.items[0]!.sessionId).toBe('sess_aug_early');
  });

  it('should clamp pagination boundaries safely (page >= 1, 1 <= limit <= 50)', async () => {
    repository.historyRecords = Array.from({ length: 60 }, (_, i) =>
      createSummaryRecord({ sessionId: `sess_${i + 1}` }),
    );

    const query = new GetClientTreatmentHistoryQuery({
      clientId: 'client_100',
      page: -5,
      limit: 500, // Should be clamped to 50
    });

    const result = await handler.execute(query);

    expect(result.isSuccess).toBe(true);
    const data = result.getValue();
    expect(data.page).toBe(1);
    expect(data.limit).toBe(50);
    expect(data.items).toHaveLength(50);
    expect(data.hasNextPage).toBe(true);
  });

  it('should reject query with empty client ID', async () => {
    const query = new GetClientTreatmentHistoryQuery({
      clientId: '   ',
    });

    const result = await handler.execute(query);

    expect(result.isFailure).toBe(true);
    expect(result.getError()).toContain('Client ID cannot be empty.');
  });

  it('should reject query when dateFrom is greater than dateTo', async () => {
    const query = new GetClientTreatmentHistoryQuery({
      clientId: 'client_100',
      dateFrom: new Date('2026-08-20T00:00:00.000Z'),
      dateTo: new Date('2026-08-10T00:00:00.000Z'),
    });

    const result = await handler.execute(query);

    expect(result.isFailure).toBe(true);
    expect(result.getError()).toContain('dateFrom cannot be greater than dateTo.');
  });
});
