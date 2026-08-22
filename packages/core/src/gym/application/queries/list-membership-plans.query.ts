import { Query } from '../shared/query.interface';

export interface ListMembershipPlansInput {
  readonly activeOnly?: boolean;
}

export class ListMembershipPlansQuery implements Query {
  public readonly queryId: string;
  public readonly timestamp: Date;

  constructor(
    public readonly input: ListMembershipPlansInput = {},
    queryId?: string,
    timestamp: Date = new Date(),
  ) {
    this.queryId =
      queryId ?? `qry_plans_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.timestamp = timestamp;
    Object.freeze(this);
  }
}
