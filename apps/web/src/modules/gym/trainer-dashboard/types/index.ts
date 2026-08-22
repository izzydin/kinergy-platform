import {
  AccessResult,
  AttendanceItemDTO,
  CheckInMethod,
  ClientSearchResultDTO,
  MembershipEligibilityDTO,
  MembershipEligibilityOutcome,
} from '../../../attendance/types';

export { AccessResult, CheckInMethod, MembershipEligibilityOutcome };

export type { AttendanceItemDTO, ClientSearchResultDTO, MembershipEligibilityDTO };

/**
 * Assigned Client Membership View Model for Trainer Dashboard.
 */
export interface AssignedClientMembershipVM {
  readonly membershipId: string;
  readonly clientId: string;
  readonly planId: string;
  readonly planName: string;
  readonly status: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly daysRemaining: number;
  readonly isExpiringSoon: boolean;
  readonly isExpired: boolean;
  readonly isCurrentlyFrozen: boolean;
  readonly assignedAt: string;
}

/**
 * Filter parameters for retrieving assigned clients.
 */
export interface AssignedClientsFilterParams {
  readonly trainerId: string;
  readonly statuses?: string[];
  readonly horizonDays?: number;
}

/**
 * Filter parameters for retrieving expiring memberships.
 */
export interface ExpiringMembershipsFilterParams {
  readonly trainerId?: string;
  readonly horizonDays?: number;
}
