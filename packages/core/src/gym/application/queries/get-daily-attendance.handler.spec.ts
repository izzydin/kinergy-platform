import { GetDailyAttendanceHandler } from './get-daily-attendance.handler';
import { GetDailyAttendanceQuery } from './get-daily-attendance.query';
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
  public setNow(date: Date): void {
    this._now = date;
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

describe("Phase 5.5-F: GetDailyAttendanceHandler (Today's Attendance Operational Feed)", () => {
  let repository: InMemoryAttendanceRepository;
  let clock: ControllableClock;
  let handler: GetDailyAttendanceHandler;

  const baseDate = new Date('2026-08-19T14:30:00.000Z'); // 09:30 AM in America/Guayaquil (UTC-5) -> 2026-08-19

  beforeEach(() => {
    repository = new InMemoryAttendanceRepository();
    clock = new ControllableClock(baseDate, 'America/Guayaquil');
    handler = new GetDailyAttendanceHandler(repository, clock);
  });

  it("1. Retrieves today's attendance feed using facility-local business timezone when date is omitted", async () => {
    const gymDay = GymDay.fromUtc(baseDate, 'America/Guayaquil', 'main');

    // Populate today's records (2 granted for distinct clients, 1 duplicate visit, 1 denied)
    const rec1 = AttendanceRecord.record(
      {
        clientId: 'client_1',
        membershipId: 'mem_1',
        checkInTime: new Date('2026-08-19T13:00:00.000Z'), // 08:00 local
        gymDay,
        method: CheckInMethod.RFID,
        result: AccessResult.GRANTED,
      },
      clock,
    );
    const rec2 = AttendanceRecord.record(
      {
        clientId: 'client_2',
        membershipId: 'mem_2',
        checkInTime: new Date('2026-08-19T13:30:00.000Z'), // 08:30 local
        gymDay,
        method: CheckInMethod.QR_CODE,
        result: AccessResult.GRANTED,
      },
      clock,
    );
    const rec3 = AttendanceRecord.record(
      {
        clientId: 'client_3',
        membershipId: null,
        checkInTime: new Date('2026-08-19T14:00:00.000Z'), // 09:00 local
        gymDay,
        method: CheckInMethod.MANUAL_RECEPTION,
        result: AccessResult.DENIED_EXPIRED,
      },
      clock,
    );

    await repository.append(rec1);
    await repository.append(rec2);
    await repository.append(rec3);

    const query = new GetDailyAttendanceQuery({});
    const result = await handler.execute(query);

    expect(result.isSuccess).toBe(true);
    const data = result.getValue();

    expect(data.items).toHaveLength(3);
    // Ordered DESC by checkInTime
    expect(data.items[0]!.clientId).toBe('client_3');
    expect(data.items[1]!.clientId).toBe('client_2');
    expect(data.items[2]!.clientId).toBe('client_1');

    // Verify daily summary KPIs
    expect(data.dailySummary).toBeDefined();
    expect(data.dailySummary!.totalCheckIns).toBe(3);
    expect(data.dailySummary!.grantedCount).toBe(2);
    expect(data.dailySummary!.deniedCount).toBe(1);
    expect(data.dailySummary!.uniqueClientsCount).toBe(2);
  });

  it('2. Supports deterministic pagination (page, limit, totalPages)', async () => {
    const gymDay = GymDay.fromUtc(baseDate, 'America/Guayaquil', 'main');

    for (let i = 1; i <= 25; i++) {
      const rec = AttendanceRecord.record(
        {
          clientId: `client_${i}`,
          membershipId: `mem_${i}`,
          checkInTime: new Date(baseDate.getTime() + i * 60000),
          gymDay,
          method: CheckInMethod.RFID,
          result: AccessResult.GRANTED,
        },
        clock,
      );
      await repository.append(rec);
    }

    // Query Page 1, limit 10
    const page1Res = await handler.execute(
      new GetDailyAttendanceQuery({
        page: 1,
        limit: 10,
      }),
    );
    expect(page1Res.isSuccess).toBe(true);
    const p1 = page1Res.getValue();
    expect(p1.items).toHaveLength(10);
    expect(p1.pagination.totalItems).toBe(25);
    expect(p1.pagination.totalPages).toBe(3);
    expect(p1.pagination.hasNextPage).toBe(true);
    expect(p1.pagination.hasPreviousPage).toBe(false);

    // Query Page 3, limit 10 (remaining 5)
    const page3Res = await handler.execute(
      new GetDailyAttendanceQuery({
        page: 3,
        limit: 10,
      }),
    );
    expect(page3Res.isSuccess).toBe(true);
    const p3 = page3Res.getValue();
    expect(p3.items).toHaveLength(5);
    expect(p3.pagination.hasNextPage).toBe(false);
    expect(p3.pagination.hasPreviousPage).toBe(true);
  });

  it('3. Filters by AccessResult and CheckInMethod accurately', async () => {
    const gymDay = GymDay.fromUtc(baseDate, 'America/Guayaquil', 'main');

    await repository.append(
      AttendanceRecord.record(
        {
          clientId: 'client_A',
          membershipId: 'mem_A',
          checkInTime: baseDate,
          gymDay,
          method: CheckInMethod.RFID,
          result: AccessResult.GRANTED,
        },
        clock,
      ),
    );
    await repository.append(
      AttendanceRecord.record(
        {
          clientId: 'client_B',
          membershipId: null,
          checkInTime: baseDate,
          gymDay,
          method: CheckInMethod.QR_CODE,
          result: AccessResult.DENIED_FROZEN,
        },
        clock,
      ),
    );

    // Filter only GRANTED
    const grantedRes = await handler.execute(
      new GetDailyAttendanceQuery({
        result: AccessResult.GRANTED,
      }),
    );
    expect(grantedRes.getValue().items).toHaveLength(1);
    expect(grantedRes.getValue().items[0]!.clientId).toBe('client_A');

    // Filter only QR_CODE
    const qrRes = await handler.execute(
      new GetDailyAttendanceQuery({
        method: CheckInMethod.QR_CODE,
      }),
    );
    expect(qrRes.getValue().items).toHaveLength(1);
    expect(qrRes.getValue().items[0]!.clientId).toBe('client_B');
  });

  it('4. Rejects invalid date format gracefully', async () => {
    const res = await handler.execute(
      new GetDailyAttendanceQuery({
        date: '19-08-2026', // invalid format
      }),
    );
    expect(res.isFailure).toBe(true);
    expect(res.getError()).toContain('Expected YYYY-MM-DD');
  });
});
