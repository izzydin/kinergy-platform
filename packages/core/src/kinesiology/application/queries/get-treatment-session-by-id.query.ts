import { Query } from '../shared/query.interface';

export interface GetTreatmentSessionByIdInput {
  readonly sessionId: string;
}

/**
 * CQRS Query to retrieve a single TreatmentSession DTO by its scalar ID.
 */
export class GetTreatmentSessionByIdQuery implements Query {
  public readonly queryId: string;
  public readonly timestamp: Date;

  constructor(
    public readonly input: GetTreatmentSessionByIdInput,
    queryId?: string,
    timestamp: Date = new Date(),
  ) {
    this.queryId = queryId ?? `qry_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.timestamp = timestamp;
    Object.freeze(this);
  }
}
