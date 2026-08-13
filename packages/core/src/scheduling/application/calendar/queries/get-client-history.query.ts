import { Query } from '../../shared/query.interface';

export interface GetClientHistoryQueryInput {
  readonly clientId: string;
}

/**
 * CQRS Read Query retrieving chronological appointment history and attendance compliance for a client.
 */
export class GetClientHistoryQuery implements Query {
  public readonly queryId: string;
  public readonly timestamp: Date;
  public readonly input: GetClientHistoryQueryInput;

  constructor(input: GetClientHistoryQueryInput, queryId?: string, timestamp: Date = new Date()) {
    if (!input || !input.clientId) {
      throw new Error('clientId is required for GetClientHistoryQuery.');
    }
    this.queryId =
      queryId ?? `qry_client_hist_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.timestamp = timestamp;
    this.input = input;
    Object.freeze(this);
  }
}
