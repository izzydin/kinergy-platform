import { Query } from '../shared/query.interface';

export interface ListExpiredMembershipsFilter {
  readonly page?: number;
  readonly limit?: number;
  readonly clientId?: string;
  readonly expiredBefore?: string | Date;
}

export class ListExpiredMembershipsQuery implements Query {
  public readonly queryId: string;
  public readonly timestamp: Date;

  constructor(
    public readonly filter: ListExpiredMembershipsFilter = {},
    queryId?: string,
    timestamp: Date = new Date(),
  ) {
    this.queryId =
      queryId ??
      `qry_expired_memberships_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.timestamp = timestamp;
    Object.freeze(this);
  }
}
