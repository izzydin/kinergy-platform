import { Query } from '../../shared/query.interface';

export interface GetUpcomingAppointmentsQueryInput {
  readonly limit?: number;
  readonly therapistId?: string;
  readonly roomId?: string;
  readonly clientId?: string;
}

/**
 * CQRS Read Query retrieving next N upcoming appointments starting from Clock.now().
 */
export class GetUpcomingAppointmentsQuery implements Query {
  public readonly queryId: string;
  public readonly timestamp: Date;
  public readonly input: GetUpcomingAppointmentsQueryInput;

  constructor(
    input: GetUpcomingAppointmentsQueryInput = {},
    queryId?: string,
    timestamp: Date = new Date(),
  ) {
    this.queryId =
      queryId ?? `qry_upcoming_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.timestamp = timestamp;
    this.input = input;
    Object.freeze(this);
  }
}
