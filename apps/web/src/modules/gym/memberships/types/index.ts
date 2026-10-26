export interface MembershipPeriodVM {
  startDate: string;
  endDate: string;
  durationDays: number;
}

export interface FreezeWindowVM {
  startDate: string;
  endDate: string;
  reason?: string;
}

export interface MembershipVM {
  id: string;
  clientId: string;
  planId: string;
  period: MembershipPeriodVM;
  status: 'ACTIVE' | 'FROZEN' | 'EXPIRED' | 'CANCELLED';
  assignedTrainerId?: string;
  freezeHistory?: FreezeWindowVM[];
  cancellationReason?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ListMembershipsFilterParams {
  clientId?: string;
  planId?: string;
  status?: string;
  startDateFrom?: string;
  startDateTo?: string;
  endDateFrom?: string;
  endDateTo?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedMembershipsVM {
  items: MembershipVM[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface MembershipEligibilityVM {
  isEligible: boolean;
  outcome: string;
  membershipId: string | null;
  planId: string | null;
  period: { startDate: string; endDate: string } | null;
  evaluatedAt: string;
  reason: string;
}

export interface CreateMembershipInputVM {
  clientId: string;
  planId: string;
  startDate?: string;
  assignedTrainerId?: string;
}

export interface RenewMembershipInputVM {
  newPlanId?: string;
  effectiveDate?: string;
}

export interface FreezeMembershipInputVM {
  startDate: string;
  endDate: string;
  reason?: string;
}

export interface CancelMembershipInputVM {
  reason?: string;
}

export interface ExpiringMembershipItemVM {
  membershipId: string;
  clientId: string;
  planId: string;
  planName: string;
  status: string;
  startDate: string;
  endDate: string;
  daysRemaining: number;
  isExpiringSoon: boolean;
  isExpired: boolean;
}

export interface ExpiringMembershipsResponseVM {
  items: ExpiringMembershipItemVM[];
  total: number;
  horizonDays: number;
}

export interface ExpiredMembershipDetailVM {
  membershipId: string;
  clientId: string;
  previousStatus: string;
  expiredAt: string;
}

export interface FailedMembershipDetailVM {
  membershipId: string;
  error: string;
}

export interface ExpireMembershipsBatchResponseVM {
  processedCount: number;
  expiredCount: number;
  skippedCount: number;
  failedCount: number;
  durationMs: number;
  dryRun: boolean;
  expired: ExpiredMembershipDetailVM[];
  errors: FailedMembershipDetailVM[];
}

export interface ExpireMembershipsBatchInputVM {
  asOfDate?: string;
  batchSize?: number;
  dryRun?: boolean;
}

export interface MemberLookupResultDTO {
  readonly id: string;
  readonly fullName: string;
  readonly email: string;
  readonly status: string;
  readonly phone?: string;
}
