import { AccessResult } from '../../domain/attendance/access-result.enum';
import { CheckInMethod } from '../../domain/attendance/check-in-method.enum';

export interface HourlyTrafficDTO {
  readonly hour: number; // 0..23 local hour
  readonly count: number;
}

export interface DayAttendanceSummaryDTO {
  readonly gymDay: string; // YYYY-MM-DD
  readonly facilityId: string;
  readonly totalCheckIns: number;
  readonly grantedVisits: number;
  readonly deniedAttempts: number;
  readonly uniqueVisitors: number;
  readonly byMethod: Record<CheckInMethod, number>;
  readonly byAccessResult: Record<AccessResult, number>;
  readonly hourlyDistribution: HourlyTrafficDTO[];
  readonly peakHour: HourlyTrafficDTO | null;
}

export interface AttendanceRangeSummaryDTO {
  readonly startDate: string; // YYYY-MM-DD
  readonly endDate: string; // YYYY-MM-DD
  readonly facilityId: string;
  readonly totalDays: number;
  readonly totalGrantedVisits: number;
  readonly totalDeniedAttempts: number;
  readonly totalUniqueVisitors: number;
  readonly averageDailyVisits: number;
  readonly dailyBreakdown: DayAttendanceSummaryDTO[];
}
