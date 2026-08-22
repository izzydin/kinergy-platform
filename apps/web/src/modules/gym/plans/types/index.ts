export interface MembershipPlanVM {
  id: string;
  code: string;
  name: string;
  description?: string;
  durationInDays: number;
  priceAmount: number;
  priceCurrency: string;
  visitQuota?: number;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ListMembershipPlansFilterParams {
  activeOnly?: boolean;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedMembershipPlansVM {
  items: MembershipPlanVM[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface CreateMembershipPlanInputVM {
  code: string;
  name: string;
  description?: string;
  durationInDays: number;
  priceAmount: number;
  priceCurrency?: string;
  visitQuota?: number;
}

export interface UpdateMembershipPlanPricingInputVM {
  priceAmount: number;
  currency?: string;
}
