import { Query } from '../shared/query.interface';

export interface GetMembershipByIdInput {
  readonly membershipId: string;
}

export class GetMembershipByIdQuery implements Query {
  public readonly queryId: string;
  public readonly timestamp: Date;

  constructor(
    public readonly input: GetMembershipByIdInput,
    queryId?: string,
    timestamp: Date = new Date(),
  ) {
    this.queryId =
      queryId ?? `qry_membership_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.timestamp = timestamp;
    Object.freeze(this);
  }
}
