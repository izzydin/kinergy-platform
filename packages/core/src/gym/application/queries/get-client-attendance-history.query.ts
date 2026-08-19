import { Query } from '../shared/query.interface';
import { AccessResult } from '../../domain/attendance/access-result.enum';

export interface GetClientAttendanceHistoryInput {
  /**
   * Client unique identifier. Required.
   */
  readonly clientId: string;

  /**
   * Optional start timestamp threshold (inclusive).
   */
  readonly dateFrom?: Date | string;

  /**
   * Optional end timestamp threshold (inclusive).
   */
  readonly dateTo?: Date | string;

  /**
   * Optional access result filter (e.g. GRANTED).
   */
  readonly result?: AccessResult;

  /**
   * Page number (1-indexed). Defaults to 1.
   */
  readonly page?: number;

  /**
   * Items per page. Defaults to 20, max 100.
   */
  readonly limit?: number;

  /**
   * Sort order by checkInTime. Defaults to 'DESC'.
   */
  readonly sortOrder?: 'ASC' | 'DESC';
}

/**
 * CQRS Query to retrieve a member's chronological attendance history and attendance statistics.
 */
export class GetClientAttendanceHistoryQuery implements Query {
  public readonly queryId: string;
  public readonly timestamp: Date;

  constructor(
    public readonly input: GetClientAttendanceHistoryInput,
    queryId?: string,
    timestamp: Date = new Date(),
  ) {
    this.queryId =
      queryId ?? `qry_client_att_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.timestamp = timestamp;
    Object.freeze(this);
  }
}
