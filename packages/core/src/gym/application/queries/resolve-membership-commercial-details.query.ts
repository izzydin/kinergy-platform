import { Query } from '../shared/query.interface';

export interface ResolveMembershipCommercialDetailsInput {
  readonly sourceId: string;
  readonly clientId?: string;
  readonly targetPlanId?: string;
}

export class ResolveMembershipCommercialDetailsQuery implements Query {
  public readonly queryId: string;
  public readonly timestamp: Date;

  constructor(
    public readonly input: ResolveMembershipCommercialDetailsInput,
    queryId?: string,
    timestamp: Date = new Date(),
  ) {
    this.queryId =
      queryId ?? `qry_comm_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.timestamp = timestamp;
    Object.freeze(this);
  }
}
