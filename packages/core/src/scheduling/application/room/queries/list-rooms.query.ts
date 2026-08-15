import { Query } from '../../shared/query.interface';

export interface ListRoomsQueryInput {
  readonly status?: string;
  readonly requiredFeatures?: string[];
  readonly minCapacity?: number;
}

export class ListRoomsQuery implements Query {
  public readonly queryId: string;
  public readonly timestamp: Date;
  public readonly input?: ListRoomsQueryInput;

  constructor(input?: ListRoomsQueryInput, queryId?: string, timestamp: Date = new Date()) {
    this.queryId = queryId ?? `qry_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.timestamp = timestamp;
    this.input = input;
    Object.freeze(this);
  }
}
