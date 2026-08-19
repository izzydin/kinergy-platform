import { Query } from '../shared/query.interface';

export interface GetAttendanceSummaryInput {
  /**
   * Start operational date in 'YYYY-MM-DD' format.
   * If omitted, defaults to the current GymDay.
   */
  readonly startDate?: string;

  /**
   * End operational date in 'YYYY-MM-DD' format.
   * If omitted, defaults to startDate.
   */
  readonly endDate?: string;

  /**
   * Facility identifier. Defaults to 'main'.
   */
  readonly facilityId?: string;
}

/**
 * CQRS Query to retrieve aggregated attendance analytics, peak traffic, and daily breakdown.
 */
export class GetAttendanceSummaryQuery implements Query {
  public readonly queryId: string;
  public readonly timestamp: Date;

  constructor(
    public readonly input: GetAttendanceSummaryInput = {},
    queryId?: string,
    timestamp: Date = new Date(),
  ) {
    this.queryId =
      queryId ?? `qry_att_summary_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.timestamp = timestamp;
    Object.freeze(this);
  }
}
