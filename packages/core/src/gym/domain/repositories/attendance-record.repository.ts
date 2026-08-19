import { AttendanceRecord } from '../attendance/attendance-record.aggregate';
import { AttendanceId } from '../attendance/attendance-id.vo';
import { AccessResult } from '../attendance/access-result.enum';
import { CheckInMethod } from '../attendance/check-in-method.enum';

export interface AttendanceQueryCriteria {
  readonly clientId?: string;
  readonly gymDay?: string;
  readonly dateFrom?: Date;
  readonly dateTo?: Date;
  readonly facilityId?: string;
  readonly result?: AccessResult;
  readonly method?: CheckInMethod;
  readonly page?: number;
  readonly limit?: number;
  readonly sortOrder?: 'ASC' | 'DESC';
}

export interface AttendanceDailyKPIs {
  readonly totalCheckIns: number;
  readonly grantedCount: number;
  readonly deniedCount: number;
  readonly uniqueClientsCount: number;
}

/**
 * Domain Repository Interface for append-only AttendanceRecord entities and query read-models.
 */
export interface AttendanceRecordRepository {
  /**
   * Appends an immutable attendance record to the log.
   */
  append(record: AttendanceRecord): Promise<void>;

  /**
   * Finds an attendance record by its unique identifier.
   */
  findById(id: AttendanceId | string): Promise<AttendanceRecord | null>;

  /**
   * Finds the most recent attendance records for a client, ordered descending by checkInTime.
   */
  findByClientId(clientId: string, limit?: number): Promise<AttendanceRecord[]>;

  /**
   * Finds attendance records for a client recorded since a given timestamp.
   * Useful for anti-passback and rapid re-scan debounce verification.
   */
  findRecentByClientId(clientId: string, since: Date): Promise<AttendanceRecord[]>;

  /**
   * Finds all attendance records for a given facility-local operational GymDay.
   */
  findByGymDay(gymDay: string, facilityId?: string): Promise<AttendanceRecord[]>;

  /**
   * Counts total granted attendance records for a specific GymDay and facility.
   */
  countGrantedByGymDay(gymDay: string, facilityId?: string): Promise<number>;

  /**
   * Counts granted check-ins for a client on a specific GymDay (quota tracking).
   */
  countGrantedByClientAndGymDay(clientId: string, gymDay: string): Promise<number>;

  /**
   * Finds paginated attendance records satisfying multi-dimensional criteria.
   */
  findWithPagination?(
    criteria: AttendanceQueryCriteria,
  ): Promise<{ records: AttendanceRecord[]; total: number }>;

  /**
   * Computes high-efficiency daily operational KPIs for a given GymDay.
   */
  getDailyKPIs?(gymDay: string, facilityId?: string): Promise<AttendanceDailyKPIs>;
}
