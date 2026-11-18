/**
 * Top-line operational summary metrics projected for the Trainer Dashboard view model (Phase 5.6-D).
 *
 * Provides aggregated operational counts without loading full client/membership entities.
 */
export interface TrainerDashboardSummaryDTO {
  /** The IAM User.id of the trainer, or 'FACILITY' / 'ALL' for elevated facility-wide queries */
  readonly trainerId: string;

  /** Evaluation timestamp (UTC ISO string) */
  readonly asOf: string;

  /** Lookahead window in days used for expiring count (default 7) */
  readonly horizonDays: number;

  /** Total number of clients currently assigned to this trainer across all non-terminal statuses */
  readonly totalAssignedClients: number;

  /** Total active memberships currently assigned to this trainer (or in facility for facility-wide queries) */
  readonly activeMembershipsCount: number;

  /** Total assigned memberships expiring within horizonDays */
  readonly expiringMembershipsCount: number;

  /** Total assigned memberships currently on freeze */
  readonly frozenMembershipsCount: number;

  /** Total granted check-in arrivals today */
  readonly todayCheckInsCount: number;

  /** Total distinct visiting clients with at least one granted check-in today */
  readonly todayClientVisitsCount?: number;

  /** Total granted check-in arrivals today */
  readonly todayGrantedCheckInsCount?: number;

  /** Total check-in attempts today (granted + denied) */
  readonly todayTotalCheckInsCount?: number;

  /** Alias for expiringMembershipsCount for backward/forward compatibility */
  readonly expiringSoonMembershipsCount?: number;
}
