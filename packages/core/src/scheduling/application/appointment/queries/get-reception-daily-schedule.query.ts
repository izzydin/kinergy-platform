import { Query } from '../../shared/query.interface';

/** Input payload for GetReceptionDailyScheduleQuery */
export interface GetReceptionDailyScheduleQueryInput {
  readonly date: string;
}

/**
 * CQRS Read Query payload to retrieve a categorized daily reception schedule.
 */
export class GetReceptionDailyScheduleQuery implements Query {
  public readonly queryId: string;
  public readonly timestamp: Date;
  public readonly input: GetReceptionDailyScheduleQueryInput;

  constructor(
    input: GetReceptionDailyScheduleQueryInput,
    queryId?: string,
    timestamp: Date = new Date(),
  ) {
    this.queryId = queryId ?? `qry_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.timestamp = timestamp;
    this.input = input;
    Object.freeze(this);
  }
}
