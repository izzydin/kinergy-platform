import { Query } from '../shared/query.interface';

export interface GetMembershipOperationalSummaryInput {
  /**
   * Optional evaluation timestamp threshold (UTC).
   * If omitted, defaults to clock.now().
   */
  readonly asOfDate?: Date | string;

  /**
   * Future lookahead window in days for expiring-soon metric.
   * Defaults to 7 days.
   */
  readonly horizonDays?: number;
}

/**
 * CQRS Read Query retrieving real-time front-desk reception operational summary metrics.
 */
export class GetMembershipOperationalSummaryQuery implements Query {
  public readonly queryId: string;
  public readonly timestamp: Date;

  constructor(
    public readonly input: GetMembershipOperationalSummaryInput = {},
    queryId?: string,
    timestamp: Date = new Date(),
  ) {
    this.queryId =
      queryId ?? `qry_summary_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.timestamp = timestamp;
    Object.freeze(this);
  }
}
