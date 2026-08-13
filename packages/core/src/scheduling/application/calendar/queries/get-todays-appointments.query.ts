import { Query } from '../../shared/query.interface';

export interface GetTodaysAppointmentsQueryInput {
  readonly therapistId?: string;
  readonly roomId?: string;
  readonly clientId?: string;
}

/**
 * CQRS Read Query retrieving light reception scan list of all appointments scheduled for the current operational day.
 */
export class GetTodaysAppointmentsQuery implements Query {
  public readonly queryId: string;
  public readonly timestamp: Date;
  public readonly input: GetTodaysAppointmentsQueryInput;

  constructor(
    input: GetTodaysAppointmentsQueryInput = {},
    queryId?: string,
    timestamp: Date = new Date(),
  ) {
    this.queryId =
      queryId ?? `qry_today_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.timestamp = timestamp;
    this.input = input;
    Object.freeze(this);
  }
}
