import { Query } from '../shared/query.interface';
import { AccessResult } from '../../domain/attendance/access-result.enum';
import { CheckInMethod } from '../../domain/attendance/check-in-method.enum';

export interface SearchAttendanceFilter {
  readonly clientId?: string;
  readonly gymDay?: string;
  readonly dateFrom?: string | Date;
  readonly dateTo?: string | Date;
  readonly facilityId?: string;
  readonly result?: AccessResult | string;
  readonly method?: CheckInMethod | string;
  readonly page?: number;
  readonly limit?: number;
}

export class SearchAttendanceQuery implements Query {
  public readonly queryId: string;
  public readonly timestamp: Date;

  constructor(
    public readonly filter: SearchAttendanceFilter = {},
    queryId?: string,
    timestamp: Date = new Date(),
  ) {
    this.queryId =
      queryId ?? `qry_att_search_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.timestamp = timestamp;
    Object.freeze(this);
  }
}
