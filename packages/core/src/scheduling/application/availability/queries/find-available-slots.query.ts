import { Query } from '../../shared/query.interface';

/** Input payload for FindAvailableSlotsQuery */
export interface FindAvailableSlotsQueryInput {
  readonly therapistId: string;
  readonly roomId: string;
  readonly serviceType?: string;
  readonly durationMinutes: number;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly timeZone?: string;
  readonly stepIntervalMinutes?: number;
}

/**
 * CQRS Read Query payload to discover open booking slots for a therapist and room.
 */
export class FindAvailableSlotsQuery implements Query {
  public readonly queryId: string;
  public readonly timestamp: Date;
  public readonly input: FindAvailableSlotsQueryInput;

  constructor(input: FindAvailableSlotsQueryInput, queryId?: string, timestamp: Date = new Date()) {
    this.queryId = queryId ?? `qry_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.timestamp = timestamp;
    this.input = input;
    Object.freeze(this);
  }
}
