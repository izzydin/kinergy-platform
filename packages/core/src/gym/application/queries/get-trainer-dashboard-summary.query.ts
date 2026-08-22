import { Query } from '../shared/query.interface';

export interface GetTrainerDashboardSummaryInput {
  /**
   * The IAM User.id of the trainer.
   */
  readonly trainerId: string;

  /**
   * Optional evaluation timestamp (UTC). Defaults to clock.now().
   */
  readonly asOfDate?: Date | string;

  /**
   * Lookahead horizon in days for expiring count (default 7 days).
   */
  readonly horizonDays?: number;

  /**
   * Facility ID for gym day timezone resolution (default 'main').
   */
  readonly facilityId?: string;

  /**
   * Timezone string for gym day resolution (default 'UTC').
   */
  readonly timezone?: string;
}

/**
 * CQRS Query to retrieve aggregated operational summary KPIs for the Trainer Dashboard (Phase 5.6-D).
 */
export class GetTrainerDashboardSummaryQuery implements Query {
  public readonly queryId: string;
  public readonly timestamp: Date;

  constructor(
    public readonly input: GetTrainerDashboardSummaryInput,
    queryId?: string,
    timestamp: Date = new Date(),
  ) {
    this.queryId =
      queryId ?? `qry_trainer_summary_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.timestamp = timestamp;
    Object.freeze(this);
  }
}
