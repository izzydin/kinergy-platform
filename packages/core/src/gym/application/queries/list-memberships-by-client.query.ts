import { Query } from '../shared/query.interface';

export interface ListMembershipsByClientInput {
  readonly clientId: string;
}

export class ListMembershipsByClientQuery implements Query {
  public readonly queryId: string;
  public readonly timestamp: Date;

  constructor(
    public readonly input: ListMembershipsByClientInput,
    queryId?: string,
    timestamp: Date = new Date(),
  ) {
    this.queryId =
      queryId ??
      `qry_client_memberships_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.timestamp = timestamp;
    Object.freeze(this);
  }
}
