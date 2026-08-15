import { Query } from '../../shared/query.interface';

export interface CheckRoomAvailabilityQueryInput {
  readonly roomId?: string;
  readonly startTime: string | Date;
  readonly endTime: string | Date;
  readonly requiredFeatures?: string[];
  readonly requiredCapacity?: number;
}

export class CheckRoomAvailabilityQuery implements Query {
  public readonly queryId: string;
  public readonly timestamp: Date;
  public readonly input: CheckRoomAvailabilityQueryInput;

  constructor(
    input: CheckRoomAvailabilityQueryInput,
    queryId?: string,
    timestamp: Date = new Date(),
  ) {
    this.queryId = queryId ?? `qry_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.timestamp = timestamp;
    this.input = input;
    Object.freeze(this);
  }
}
