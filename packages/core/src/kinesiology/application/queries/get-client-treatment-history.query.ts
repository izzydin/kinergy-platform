import { Query } from '../shared/query.interface';
import { SessionStatus } from '../../domain/treatment-session/session-status.enum';

export interface GetClientTreatmentHistoryInput {
  readonly clientId: string;
  readonly page?: number;
  readonly limit?: number;
  readonly status?: SessionStatus;
  readonly therapistId?: string;
  readonly dateFrom?: Date;
  readonly dateTo?: Date;
}

/**
 * CQRS Query to retrieve a client's chronological treatment history with pagination and filtering.
 */
export class GetClientTreatmentHistoryQuery implements Query {
  public readonly queryId: string;
  public readonly timestamp: Date;

  constructor(
    public readonly input: GetClientTreatmentHistoryInput,
    queryId?: string,
    timestamp: Date = new Date(),
  ) {
    this.queryId = queryId ?? `qry_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.timestamp = timestamp;
    Object.freeze(this);
  }
}
