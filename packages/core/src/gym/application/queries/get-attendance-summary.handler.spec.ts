import { GetAttendanceSummaryHandler } from './get-attendance-summary.handler';
import { GetAttendanceSummaryQuery } from './get-attendance-summary.query';
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

describe('Phase 5.5-F: GetAttendanceSummaryHandler (Operational Analytics & Daily Breakdown)', () => {
  let repository: InMemoryAttendanceRepository;
  let clock: ControllableClock;
  let handler: GetAttendanceSummaryHandler;

  const baseDate = new Date('2026-08-19T14:30:00.000Z');

  beforeEach(() => {
    repository = new InMemoryAttendanceRepository();
    clock = new ControllableClock(baseDate, 'America/Guayaquil');
    handler = new GetAttendanceSummaryHandler(repository, clock);
  });

  it('1. Computes multi-day aggregated summary, unique visitors, and peak hour', async () => {
    // Populate Day 1: 2026-08-18 (2 clients granted at 14:00 and 14:30 UTC -> peak hour 14)
    const day1 = GymDay.create('2026-08-18', 'America/Guayaquil', 'main');
    await repository.append(
      AttendanceRecord.record(
        {
          clientId: 'client_1',
          membershipId: 'mem_1',
          checkInTime: new Date('2026-08-18T14:00:00.000Z'),
          gymDay: day1,
          method: CheckInMethod.RFID,
          result: AccessResult.GRANTED,
        },
        clock,
      ),
    );
    await repository.append(
      AttendanceRecord.record(
        {
          clientId: 'client_2',
          membershipId: 'mem_2',
          checkInTime: new Date('2026-08-18T14:30:00.000Z'),
          gymDay: day1,
          method: CheckInMethod.QR_CODE,
          result: AccessResult.GRANTED,
        },
        clock,
      ),
    );

    // Populate Day 2: 2026-08-19 (1 client granted, 1 denied)
    const day2 = GymDay.create('2026-08-19', 'America/Guayaquil', 'main');

    await repository.append(
      AttendanceRecord.record(
        {
          clientId: 'client_1', // repeat client from day 1
          membershipId: 'mem_1',
          checkInTime: new Date('2026-08-19T10:00:00.000Z'),
          gymDay: day2,
          method: CheckInMethod.RFID,
          result: AccessResult.GRANTED,
        },
        clock,
      ),
    );
    await repository.append(
      AttendanceRecord.record(
        {
          clientId: 'client_3',
          membershipId: null,
          checkInTime: new Date('2026-08-19T11:00:00.000Z'),
          gymDay: day2,
          method: CheckInMethod.MANUAL_RECEPTION,
          result: AccessResult.DENIED_EXPIRED,
        },
        clock,
      ),
    );

    const query = new GetAttendanceSummaryQuery({
      startDate: '2026-08-18',
      endDate: '2026-08-19',
    });

    const result = await handler.execute(query);

    expect(result.isSuccess).toBe(true);
    const summary = result.getValue();

    expect(summary.totalDays).toBe(2);
    expect(summary.totalGrantedVisits).toBe(3);
    expect(summary.totalDeniedAttempts).toBe(1);
    expect(summary.totalUniqueVisitors).toBe(2); // client_1 and client_2
    expect(summary.averageDailyVisits).toBe(1.5);

    // Verify Day 1 breakdown
    const d1 = summary.dailyBreakdown[0]!;
    expect(d1.gymDay).toBe('2026-08-18');
    expect(d1.grantedVisits).toBe(2);
    expect(d1.peakHour).toEqual({ hour: 14, count: 2 });
    expect(d1.byMethod[CheckInMethod.RFID]).toBe(1);
    expect(d1.byMethod[CheckInMethod.QR_CODE]).toBe(1);

    // Verify Day 2 breakdown
    const d2 = summary.dailyBreakdown[1]!;
    expect(d2.gymDay).toBe('2026-08-19');
    expect(d2.grantedVisits).toBe(1);
    expect(d2.deniedAttempts).toBe(1);
    expect(d2.byAccessResult[AccessResult.DENIED_EXPIRED]).toBe(1);
  });

  it('2. Rejects invalid date format in range query', async () => {
    const res = await handler.execute(
      new GetAttendanceSummaryQuery({
        startDate: 'invalid-date',
      }),
    );
    expect(res.isFailure).toBe(true);
    expect(res.getError()).toContain('Expected YYYY-MM-DD');
  });
});
