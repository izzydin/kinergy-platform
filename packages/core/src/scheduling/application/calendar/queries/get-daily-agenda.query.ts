import { Query } from '../../shared/query.interface';

export interface GetDailyAgendaQueryInput {
  readonly date: string | Date;
  readonly therapistId?: string;
  readonly roomId?: string;
  readonly timezone?: string;
}

/**
 * CQRS Read Query retrieving structured daily agenda grid view.
 */
export class GetDailyAgendaQuery implements Query {
  public readonly queryId: string;
  public readonly timestamp: Date;
  public readonly input: GetDailyAgendaQueryInput;

  constructor(input: GetDailyAgendaQueryInput, queryId?: string, timestamp: Date = new Date()) {
    if (!input || !input.date) {
      throw new Error('Target date is required for GetDailyAgendaQuery.');
    }
    this.queryId =
      queryId ?? `qry_daily_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.timestamp = timestamp;
    this.input = input;
    Object.freeze(this);
  }
}
