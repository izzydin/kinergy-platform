import { Query } from '../shared/query.interface';

export interface GetMembershipPlanByIdInput {
  readonly planId: string;
}

export class GetMembershipPlanByIdQuery implements Query {
  public readonly queryId: string;
  public readonly timestamp: Date;

  constructor(
    public readonly input: GetMembershipPlanByIdInput,
    queryId?: string,
    timestamp: Date = new Date(),
  ) {
    this.queryId =
      queryId ?? `qry_plan_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.timestamp = timestamp;
    Object.freeze(this);
  }
}
