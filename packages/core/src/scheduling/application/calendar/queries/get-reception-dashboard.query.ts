import { Query } from '../../shared/query.interface';

export interface GetReceptionDashboardQueryInput {
  readonly date?: string | Date;
}

/**
 * CQRS Read Query retrieving real-time front-desk reception operational dashboard.
 */
export class GetReceptionDashboardQuery implements Query {
  public readonly queryId: string;
  public readonly timestamp: Date;
  public readonly input: GetReceptionDashboardQueryInput;

  constructor(
    input: GetReceptionDashboardQueryInput = {},
    queryId?: string,
    timestamp: Date = new Date(),
  ) {
    this.queryId =
      queryId ?? `qry_reception_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.timestamp = timestamp;
    this.input = input;
    Object.freeze(this);
  }
}
