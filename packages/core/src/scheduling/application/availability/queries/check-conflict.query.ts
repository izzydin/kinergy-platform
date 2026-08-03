import { Query } from '../../shared/query.interface';

/** Input payload for CheckConflictQuery */
export interface CheckConflictQueryInput {
  readonly therapistId: string;
  readonly roomId: string;
  readonly clientId: string;
  readonly startTime: Date;
  readonly endTime: Date;
  readonly appointmentType?: string;
  readonly ignoreAppointmentId?: string;
}

/**
 * CQRS Read Query payload to pre-validate scheduling conflicts.
 */
export class CheckConflictQuery implements Query {
  public readonly queryId: string;
  public readonly timestamp: Date;
  public readonly input: CheckConflictQueryInput;

  constructor(input: CheckConflictQueryInput, queryId?: string, timestamp: Date = new Date()) {
    this.queryId = queryId ?? `qry_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.timestamp = timestamp;
    this.input = input;
    Object.freeze(this);
  }
}
