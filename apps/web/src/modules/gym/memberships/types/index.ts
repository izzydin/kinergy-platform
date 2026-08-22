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
