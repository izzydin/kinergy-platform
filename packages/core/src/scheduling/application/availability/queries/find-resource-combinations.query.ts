import { Query } from '../../shared/query.interface';

/** Input payload for FindResourceCombinationsQuery */
export interface FindResourceCombinationsQueryInput {
  readonly therapistIds?: string[];
  readonly roomIds?: string[];
  readonly requiredFeatures?: string[];
  readonly requiredCapacity?: number;
  readonly durationMinutes: number;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly timeZone?: string;
  readonly stepIntervalMinutes?: number;
}

/**
 * CQRS Read Query payload to discover multi-resource combination booking options.
 */
export class FindResourceCombinationsQuery implements Query {
  public readonly queryId: string;
  public readonly timestamp: Date;
  public readonly input: FindResourceCombinationsQueryInput;

  constructor(
    input: FindResourceCombinationsQueryInput,
    queryId?: string,
    timestamp: Date = new Date(),
  ) {
    this.queryId = queryId ?? `qry_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.timestamp = timestamp;
    this.input = input;
    Object.freeze(this);
  }
}
