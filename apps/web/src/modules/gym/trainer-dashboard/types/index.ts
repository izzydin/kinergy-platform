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
 * Authoritative summary KPIs for Trainer Dashboard (from /summary endpoint).
 */
export interface TrainerDashboardSummaryVM {
  readonly totalAssignedClients: number;
  readonly activeMembershipsCount: number;
  readonly expiringSoonMembershipsCount: number;
  readonly frozenMembershipsCount: number;
  readonly todayGrantedCheckInsCount: number;
  readonly asOfDate: string;
  readonly horizonDays: number;
}

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
 * Paginated Assigned Clients response view model (from /clients endpoint).
 */
export interface PaginatedAssignedClientsVM {
  readonly items: AssignedClientMembershipVM[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
  readonly totalPages: number;
}

/**
 * Expiring membership item view model (from /expiring-memberships endpoint).
 */
export interface ExpiringMembershipItemVM {
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
}

/**
 * Attendance item view model for Trainer Dashboard feed (from /attendance endpoint).
 */
export interface TrainerAttendanceItemVM {
  readonly id: string;
  readonly clientId: string;
  readonly membershipId?: string;
  readonly checkInTime: string;
  readonly gymDay: string;
  readonly method: CheckInMethod;
  readonly result: AccessResult;
  readonly gateId?: string;
}

/**
 * Attendance feed response view model (from /attendance endpoint).
 */
export interface TrainerAttendanceResponseVM {
  readonly items: TrainerAttendanceItemVM[];
  readonly total: number;
  readonly grantedCount: number;
  readonly page: number;
  readonly limit: number;
  readonly totalPages: number;
}

/**
 * Filter parameters for retrieving assigned clients.
 */
export interface AssignedClientsFilterParams {
  readonly trainerId?: string;
  readonly statuses?: string[];
  readonly horizonDays?: number;
  readonly asOfDate?: string;
  readonly page?: number;
  readonly limit?: number;
  readonly sortBy?: 'daysRemaining' | 'endDate' | 'startDate' | 'assignedAt';
  readonly sortOrder?: 'ASC' | 'DESC';
}

/**
 * Filter parameters for retrieving expiring memberships.
 */
export interface ExpiringMembershipsFilterParams {
  readonly trainerId?: string;
  readonly horizonDays?: number;
  readonly asOfDate?: string;
}

/**
 * Filter parameters for retrieving summary KPIs.
 */
export interface TrainerSummaryFilterParams {
  readonly trainerId?: string;
  readonly horizonDays?: number;
  readonly asOfDate?: string;
  readonly timezone?: string;
  readonly facilityId?: string;
}

/**
 * Filter parameters for retrieving trainer attendance.
 */
export interface TrainerAttendanceFilterParams {
  readonly trainerId?: string;
  readonly date?: string;
  readonly facilityId?: string;
  readonly timezone?: string;
  readonly page?: number;
  readonly limit?: number;
}
