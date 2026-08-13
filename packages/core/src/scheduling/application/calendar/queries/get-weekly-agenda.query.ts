import { Query } from '../../shared/query.interface';

export interface GetWeeklyAgendaQueryInput {
  readonly startDate: string | Date;
  readonly therapistId?: string;
  readonly roomId?: string;
  readonly timezone?: string;
}

/**
 * CQRS Read Query retrieving structured 7-day weekly agenda view.
 */
export class GetWeeklyAgendaQuery implements Query {
  public readonly queryId: string;
  public readonly timestamp: Date;
  public readonly input: GetWeeklyAgendaQueryInput;

  constructor(input: GetWeeklyAgendaQueryInput, queryId?: string, timestamp: Date = new Date()) {
    if (!input || !input.startDate) {
      throw new Error('Target startDate is required for GetWeeklyAgendaQuery.');
    }
    this.queryId =
      queryId ?? `qry_weekly_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.timestamp = timestamp;
    this.input = input;
    Object.freeze(this);
  }
}
