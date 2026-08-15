import { Query } from '../../shared/query.interface';

export interface GetRoomQueryInput {
  readonly roomId: string;
}

export class GetRoomQuery implements Query {
  public readonly queryId: string;
  public readonly timestamp: Date;
  public readonly input: GetRoomQueryInput;

  constructor(input: GetRoomQueryInput, queryId?: string, timestamp: Date = new Date()) {
    this.queryId = queryId ?? `qry_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.timestamp = timestamp;
    this.input = input;
    Object.freeze(this);
  }
}
