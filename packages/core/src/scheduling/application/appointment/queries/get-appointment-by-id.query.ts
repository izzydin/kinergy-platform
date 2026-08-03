import { Query } from '../../shared/query.interface';

/** Input payload for GetAppointmentByIdQuery */
export interface GetAppointmentByIdQueryInput {
  readonly appointmentId: string;
}

/**
 * CQRS Read Query payload to fetch a single appointment by ID.
 */
export class GetAppointmentByIdQuery implements Query {
  public readonly queryId: string;
  public readonly timestamp: Date;
  public readonly input: GetAppointmentByIdQueryInput;

  constructor(input: GetAppointmentByIdQueryInput, queryId?: string, timestamp: Date = new Date()) {
    this.queryId = queryId ?? `qry_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.timestamp = timestamp;
    this.input = input;
    Object.freeze(this);
  }
}
