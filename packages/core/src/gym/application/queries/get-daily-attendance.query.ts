import { Query } from '../shared/query.interface';
import { AccessResult } from '../../domain/attendance/access-result.enum';
import { CheckInMethod } from '../../domain/attendance/check-in-method.enum';

export interface GetDailyAttendanceInput {
  /**
   * Target operational date in 'YYYY-MM-DD' format.
   * If omitted, defaults to the facility-local current GymDay using Clock.
   */
  readonly date?: string;

  /**
   * Facility identifier. Defaults to 'main'.
   */
  readonly facilityId?: string;

  /**
   * Optional access result filter (e.g. GRANTED, DENIED_EXPIRED).
   */
  readonly result?: AccessResult;

  /**
   * Optional check-in method filter (e.g. RFID, QR_CODE, PIN, MANUAL).
   */
  readonly method?: CheckInMethod;

  /**
   * Page number (1-indexed). Defaults to 1.
   */
  readonly page?: number;

  /**
   * Items per page. Defaults to 20, max 100.
   */
  readonly limit?: number;

  /**
   * Sorting order by checkInTime. Defaults to 'DESC'.
   */
  readonly sortOrder?: 'ASC' | 'DESC';

  /**
   * Optional whitelist of clientIds to scope the attendance feed.
   * When provided, only records whose clientId is in this set are returned.
   * Used by the Trainer Operational Dashboard to show only assigned-client check-ins.
   */
  readonly assignedClientIds?: string[];
}

/**
 * CQRS Query to retrieve the operational daily attendance feed with KPIs and pagination.
 */
export class GetDailyAttendanceQuery implements Query {
  public readonly queryId: string;
  public readonly timestamp: Date;

  constructor(
    public readonly input: GetDailyAttendanceInput = {},
    queryId?: string,
    timestamp: Date = new Date(),
  ) {
    this.queryId =
      queryId ?? `qry_daily_att_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.timestamp = timestamp;
    Object.freeze(this);
  }
}
