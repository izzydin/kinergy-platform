import { GetClientAttendanceHistoryHandler } from './get-client-attendance-history.handler';
import { GetClientAttendanceHistoryQuery } from './get-client-attendance-history.query';
import { AttendanceRecordRepository } from '../../domain/repositories/attendance-record.repository';
import { Clock } from '../../domain/shared/clock';
import { AttendanceRecord } from '../../domain/attendance/attendance-record.aggregate';
import { AccessResult } from '../../domain/attendance/access-result.enum';
import { CheckInMethod } from '../../domain/attendance/check-in-method.enum';
import { GymDay } from '../../domain/attendance/gym-day.vo';
import { AttendanceId } from '../../domain/attendance/attendance-id.vo';

class ControllableClock implements Clock {
  constructor(
    private _now: Date,
    private _tz: string = 'America/Guayaquil',
  ) {}
  public now(): Date {
    return new Date(this._now.getTime());
  }
  public timezone(): string {
    return this._tz;
  }
}

class InMemoryAttendanceRepository implements AttendanceRecordRepository {
  public records: AttendanceRecord[] = [];

  public async append(record: AttendanceRecord): Promise<void> {
    this.records.push(record);
  }

  public async findById(id: AttendanceId | string): Promise<AttendanceRecord | null> {
    const idVal = typeof id === 'string' ? id : id.value;
    return this.records.find((r) => r.id.value === idVal) || null;
  }

  public async findByClientId(clientId: string, limit?: number): Promise<AttendanceRecord[]> {
    const matching = this.records
      .filter((r) => r.clientId === clientId)
      .sort((a, b) => b.checkInTime.getTime() - a.checkInTime.getTime());
    return limit ? matching.slice(0, limit) : matching;
  }

  public async findRecentByClientId(clientId: string, since: Date): Promise<AttendanceRecord[]> {
    return this.records
      .filter((r) => r.clientId === clientId && r.checkInTime.getTime() >= since.getTime())
      .sort((a, b) => b.checkInTime.getTime() - a.checkInTime.getTime());
  }

  public async findByGymDay(gymDay: string, facilityId?: string): Promise<AttendanceRecord[]> {
    return this.records.filter(
      (r) => r.gymDay.localDate === gymDay && (!facilityId || r.gymDay.facilityId === facilityId),
    );
  }

  public async countGrantedByGymDay(gymDay: string, facilityId?: string): Promise<number> {
    return this.records.filter(
      (r) =>
        r.isGranted() &&
        r.gymDay.localDate === gymDay &&
        (!facilityId || r.gymDay.facilityId === facilityId),
    ).length;
  }

  public async countGrantedByClientAndGymDay(clientId: string, gymDay: string): Promise<number> {
    return this.records.filter(
      (r) => r.clientId === clientId && r.isGranted() && r.gymDay.localDate === gymDay,
    ).length;
  }
}

describe('Phase 5.5-F: GetClientAttendanceHistoryHandler (Member History & Visit Stats)', () => {
  let repository: InMemoryAttendanceRepository;
  let clock: ControllableClock;
  let handler: GetClientAttendanceHistoryHandler;

  const baseDate = new Date('2026-08-19T14:30:00.000Z');

  beforeEach(() => {
    repository = new InMemoryAttendanceRepository();
    clock = new ControllableClock(baseDate, 'America/Guayaquil');
    handler = new GetClientAttendanceHistoryHandler(repository);
  });

  it('1. Retrieves chronological attendance history and visit statistics for a client', async () => {
    const clientId = 'client_vip_1';

    // 3 historical visits (2026-08-01, 2026-08-10, 2026-08-19)
    const dates = [
      new Date('2026-08-01T14:00:00.000Z'),
      new Date('2026-08-10T15:00:00.000Z'),
      new Date('2026-08-19T16:00:00.000Z'),
    ];

    for (const d of dates) {
      const gymDay = GymDay.fromUtc(d, 'America/Guayaquil', 'main');
      await repository.append(
        AttendanceRecord.record(
          {
            clientId,
            membershipId: 'mem_1',
            checkInTime: d,
            gymDay,
            method: CheckInMethod.RFID,
            result: AccessResult.GRANTED,
          },
          clock,
        ),
      );
    }

    const query = new GetClientAttendanceHistoryQuery({ clientId });
    const result = await handler.execute(query);

    expect(result.isSuccess).toBe(true);
    const data = result.getValue();

    expect(data.items).toHaveLength(3);
    // Ordered DESC (newest first)
    expect(data.items[0]!.checkInTime).toBe('2026-08-19T16:00:00.000Z');
    expect(data.items[2]!.checkInTime).toBe('2026-08-01T14:00:00.000Z');

    // Stats
    expect(data.clientStats).toBeDefined();
    expect(data.clientStats!.totalVisits).toBe(3);
    expect(data.clientStats!.firstVisitAt).toBe('2026-08-01T14:00:00.000Z');
    expect(data.clientStats!.lastVisitAt).toBe('2026-08-19T16:00:00.000Z');
  });

  it('2. Filters client history by date range (dateFrom, dateTo)', async () => {
    const clientId = 'client_filtered';

    const d1 = new Date('2026-08-01T10:00:00.000Z');
    const d2 = new Date('2026-08-15T10:00:00.000Z');
    const d3 = new Date('2026-08-25T10:00:00.000Z');

    for (const d of [d1, d2, d3]) {
      const gymDay = GymDay.fromUtc(d, 'America/Guayaquil', 'main');
      await repository.append(
        AttendanceRecord.record(
          {
            clientId,
            membershipId: 'mem_1',
            checkInTime: d,
            gymDay,
            method: CheckInMethod.QR_CODE,
            result: AccessResult.GRANTED,
          },
          clock,
        ),
      );
    }

    const result = await handler.execute(
      new GetClientAttendanceHistoryQuery({
        clientId,
        dateFrom: '2026-08-10T00:00:00.000Z',
        dateTo: '2026-08-20T23:59:59.000Z',
      }),
    );

    expect(result.isSuccess).toBe(true);
    expect(result.getValue().items).toHaveLength(1);
    expect(result.getValue().items[0]!.checkInTime).toBe('2026-08-15T10:00:00.000Z');
  });

  it('3. Rejects query with empty clientId or invalid date range', async () => {
    const emptyClientRes = await handler.execute(
      new GetClientAttendanceHistoryQuery({ clientId: '' }),
    );
    expect(emptyClientRes.isFailure).toBe(true);

    const invalidRangeRes = await handler.execute(
      new GetClientAttendanceHistoryQuery({
        clientId: 'client_1',
        dateFrom: '2026-08-20',
        dateTo: '2026-08-10', // earlier than dateFrom
      }),
    );
    expect(invalidRangeRes.isFailure).toBe(true);
    expect(invalidRangeRes.getError()).toContain('cannot be later than');
  });
});
