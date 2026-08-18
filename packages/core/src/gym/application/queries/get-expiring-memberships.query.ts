import { Query } from '../shared/query.interface';

export interface GetExpiringMembershipsInput {
  /**
   * Optional evaluation timestamp threshold (UTC).
   * If omitted, defaults to clock.now().
   */
  readonly asOfDate?: Date | string;

  /**
   * Future lookahead window in days for expiring-soon threshold.
   * Defaults to 7 days.
   */
  readonly horizonDays?: number;
}

/**
 * CQRS Read Query retrieving active/frozen memberships expiring within a specified future horizon.
 */
export class GetExpiringMembershipsQuery implements Query {
  public readonly queryId: string;
  public readonly timestamp: Date;

  constructor(
    public readonly input: GetExpiringMembershipsInput = {},
    queryId?: string,
    timestamp: Date = new Date(),
  ) {
    this.queryId =
      queryId ?? `qry_expiring_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.timestamp = timestamp;
    Object.freeze(this);
  }
}
