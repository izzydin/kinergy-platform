import { Query } from '../shared/query.interface';
import { MembershipStatus } from '../../domain/membership/membership-status.enum';

export interface ListMembershipsFilter {
  readonly clientId?: string;
  readonly planId?: string;
  readonly status?: MembershipStatus | string;
  readonly startDateFrom?: string | Date;
  readonly startDateTo?: string | Date;
  readonly endDateFrom?: string | Date;
  readonly endDateTo?: string | Date;
  readonly page?: number;
  readonly limit?: number;
}

export class ListMembershipsQuery implements Query {
  public readonly queryId: string;
  public readonly timestamp: Date;

  constructor(
    public readonly filter: ListMembershipsFilter = {},
    queryId?: string,
    timestamp: Date = new Date(),
  ) {
    this.queryId =
      queryId ?? `qry_memberships_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.timestamp = timestamp;
    Object.freeze(this);
  }
}
