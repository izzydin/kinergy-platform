import { QueryHandler } from '../shared/query-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { GetAttendanceSummaryQuery } from './get-attendance-summary.query';
import {
  AttendanceRangeSummaryDTO,
  DayAttendanceSummaryDTO,
  HourlyTrafficDTO,
} from '../dtos/attendance-summary.dto';
import { AttendanceRecordRepository } from '../../domain/repositories/attendance-record.repository';
import { Clock } from '../../domain/shared/clock';
import { GymDay } from '../../domain/attendance/gym-day.vo';
import { CheckInMethod } from '../../domain/attendance/check-in-method.enum';
import { AccessResult } from '../../domain/attendance/access-result.enum';
import { AttendanceRecord } from '../../domain/attendance/attendance-record.aggregate';

/**
 * CQRS Query Handler aggregating daily and date-range attendance analytics.
 */
export class GetAttendanceSummaryHandler implements QueryHandler<
  GetAttendanceSummaryQuery,
  ApplicationResult<AttendanceRangeSummaryDTO>
> {
  constructor(
    private readonly attendanceRepository: AttendanceRecordRepository,
    private readonly clock: Clock,
  ) {}

  public async execute(
    query: GetAttendanceSummaryQuery,
  ): Promise<ApplicationResult<AttendanceRangeSummaryDTO>> {
    try {
      const { input } = query;
      const facilityId = input.facilityId?.trim() || 'main';
      const timezone = this.clock.timezone();

      let startDateStr: string;
      if (input.startDate?.trim()) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate.trim())) {
          return ApplicationResult.fail(
            `Invalid startDate format '${input.startDate}'. Expected YYYY-MM-DD.`,
          );
        }
        startDateStr = input.startDate.trim();
      } else {
        startDateStr = GymDay.fromUtc(this.clock.now(), timezone, facilityId).localDate;
      }

      let endDateStr: string;
      if (input.endDate?.trim()) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(input.endDate.trim())) {
          return ApplicationResult.fail(
            `Invalid endDate format '${input.endDate}'. Expected YYYY-MM-DD.`,
          );
        }
        endDateStr = input.endDate.trim();
      } else {
        endDateStr = startDateStr;
      }

      if (startDateStr > endDateStr) {
        return ApplicationResult.fail('startDate cannot be later than endDate.');
      }

      // Generate list of dates in range
      const dateList = this.generateDateRange(startDateStr, endDateStr);

      const dailySummaries: DayAttendanceSummaryDTO[] = [];
      const globalUniqueClients = new Set<string>();
      let totalGrantedVisits = 0;
      let totalDeniedAttempts = 0;

      for (const dayStr of dateList) {
        const dayRecords = await this.attendanceRepository.findByGymDay(dayStr, facilityId);
        const daySummary = this.summarizeDay(dayStr, facilityId, dayRecords);
        dailySummaries.push(daySummary);

        totalGrantedVisits += daySummary.grantedVisits;
        totalDeniedAttempts += daySummary.deniedAttempts;

        for (const record of dayRecords) {
          if (record.isGranted()) {
            globalUniqueClients.add(record.clientId);
          }
        }
      }

      const totalDays = dailySummaries.length;
      const averageDailyVisits =
        totalDays > 0 ? Number((totalGrantedVisits / totalDays).toFixed(2)) : 0;

      return ApplicationResult.ok<AttendanceRangeSummaryDTO>({
        startDate: startDateStr,
        endDate: endDateStr,
        facilityId,
        totalDays,
        totalGrantedVisits,
        totalDeniedAttempts,
        totalUniqueVisitors: globalUniqueClients.size,
        averageDailyVisits,
        dailyBreakdown: dailySummaries,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown query error';
      return ApplicationResult.fail(`Failed to retrieve attendance summary: ${message}`);
    }
  }

  private summarizeDay(
    gymDay: string,
    facilityId: string,
    records: AttendanceRecord[],
  ): DayAttendanceSummaryDTO {
    const grantedRecords = records.filter((r) => r.isGranted());
    const deniedRecords = records.filter((r) => !r.isGranted());
    const uniqueClients = new Set(grantedRecords.map((r) => r.clientId));

    // By Method
    const byMethod: Record<CheckInMethod, number> = {
      [CheckInMethod.BARCODE]: 0,
      [CheckInMethod.RFID]: 0,
      [CheckInMethod.QR_CODE]: 0,
      [CheckInMethod.MANUAL_RECEPTION]: 0,
      [CheckInMethod.BIOMETRIC]: 0,
    };

    for (const r of records) {
      if (byMethod[r.method] !== undefined) {
        byMethod[r.method]++;
      }
    }

    // By Access Result
    const byAccessResult: Record<AccessResult, number> = {
      [AccessResult.GRANTED]: 0,
      [AccessResult.DENIED_NO_MEMBERSHIP]: 0,
      [AccessResult.DENIED_EXPIRED]: 0,
      [AccessResult.DENIED_FROZEN]: 0,
      [AccessResult.DENIED_INACTIVE_CLIENT]: 0,
      [AccessResult.DENIED_LIMIT_REACHED]: 0,
      [AccessResult.DENIED_DUPLICATE_CHECKIN]: 0,
    };

    for (const r of records) {
      if (byAccessResult[r.result] !== undefined) {
        byAccessResult[r.result]++;
      }
    }

    // Hourly distribution (based on UTC checkInTime converted to local hours or standard 0..23)
    const hourlyCounts = new Map<number, number>();
    for (let h = 0; h < 24; h++) {
      hourlyCounts.set(h, 0);
    }

    for (const r of grantedRecords) {
      const hour = r.checkInTime.getUTCHours(); // or local hour
      hourlyCounts.set(hour, (hourlyCounts.get(hour) || 0) + 1);
    }

    const hourlyDistribution: HourlyTrafficDTO[] = Array.from(hourlyCounts.entries()).map(
      ([hour, count]) => ({ hour, count }),
    );

    let peakHour: HourlyTrafficDTO | null = null;
    for (const item of hourlyDistribution) {
      if (item.count > 0 && (!peakHour || item.count > peakHour.count)) {
        peakHour = item;
      }
    }

    return {
      gymDay,
      facilityId,
      totalCheckIns: records.length,
      grantedVisits: grantedRecords.length,
      deniedAttempts: deniedRecords.length,
      uniqueVisitors: uniqueClients.size,
      byMethod,
      byAccessResult,
      hourlyDistribution,
      peakHour,
    };
  }

  private generateDateRange(startDateStr: string, endDateStr: string): string[] {
    const dates: string[] = [];
    const current = new Date(`${startDateStr}T00:00:00.000Z`);
    const end = new Date(`${endDateStr}T00:00:00.000Z`);

    while (current.getTime() <= end.getTime()) {
      dates.push(current.toISOString().slice(0, 10));
      current.setUTCDate(current.getUTCDate() + 1);
    }

    return dates;
  }
}
