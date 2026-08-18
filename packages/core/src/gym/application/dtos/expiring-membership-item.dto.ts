/**
 * Operational read model representation of a membership with derived temporal indicators.
 */
export interface ExpiringMembershipItemDTO {
  readonly membershipId: string;
  readonly clientId: string;
  readonly planId: string;
  readonly status: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly daysRemaining: number;
  readonly isExpiringSoon: boolean;
  readonly isExpired: boolean;
  readonly isCurrentlyFrozen: boolean;
}
