/**
 * Operational dashboard read model summarizing gym membership statuses and temporal horizons.
 */
export interface MembershipOperationalSummaryDTO {
  readonly totalActive: number;
  readonly expiringSoonCount: number;
  readonly expiredCount: number;
  readonly frozenCount: number;
  readonly pendingCount: number;
  readonly totalMemberships: number;
  readonly asOfDate: string;
  readonly horizonDays: number;
}
