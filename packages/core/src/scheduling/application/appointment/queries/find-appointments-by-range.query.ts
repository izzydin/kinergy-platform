import { Query } from '../../shared/query.interface';

/** Input payload for FindAppointmentsByRangeQuery */
export interface FindAppointmentsByRangeQueryInput {
  readonly startTime: string;
  readonly endTime: string;
  readonly therapistId?: string;
  readonly roomId?: string;
  readonly clientId?: string;
  readonly status?: string;
}

/**
 * CQRS Read Query payload to search appointments within a time range and optional filters.
 */
export class FindAppointmentsByRangeQuery implements Query {
  public readonly queryId: string;
  public readonly timestamp: Date;
  public readonly input: FindAppointmentsByRangeQueryInput;

  constructor(
    input: FindAppointmentsByRangeQueryInput,
    queryId?: string,
    timestamp: Date = new Date(),
  ) {
    this.queryId = queryId ?? `qry_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.timestamp = timestamp;
    this.input = input;
    Object.freeze(this);
  }
}
