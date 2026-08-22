/**
 * Operational read model representing a single assigned client's membership
 * as projected for a Trainer Dashboard view.
 *
 * Includes membership lifecycle fields and derived temporal indicators.
 * Pricing and commercial terms are intentionally excluded from this DTO
 * (Trainer role has no billing.read permission).
 */
export interface AssignedClientMembershipDTO {
  /** Membership aggregate identifier */
  readonly membershipId: string;

  /** Client profile identifier (references Client Management bounded context) */
  readonly clientId: string;

  /** MembershipPlan catalogue identifier */
  readonly planId: string;

  /** Human-readable plan name resolved from MembershipPlan.name */
  readonly planName: string;

  /** Current lifecycle status of the membership */
  readonly status: string;

  /** Membership period start date as UTC ISO string */
  readonly startDate: string;

  /** Membership period end date as UTC ISO string */
  readonly endDate: string;

  /** Calendar days remaining until expiration (backend-computed; 0 if expired) */
  readonly daysRemaining: number;

  /**
   * True when the membership is within the configured expiring-soon horizon window.
   * Computed backend-side via GetAssignedClientMembershipsHandler — never recomputed in frontend.
   */
  readonly isExpiringSoon: boolean;

  /** True when the membership is in an expired temporal state */
  readonly isExpired: boolean;

  /** True when the membership is currently in an active freeze window */
  readonly isCurrentlyFrozen: boolean;

  /** Trainer assignment timestamp as UTC ISO string */
  readonly assignedAt: string;
}
