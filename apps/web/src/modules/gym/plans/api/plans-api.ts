import { httpClient } from '../../../../shared/api/http-client';
import {
  MembershipPlanVM,
  ListMembershipPlansFilterParams,
  PaginatedMembershipPlansVM,
  CreateMembershipPlanInputVM,
  UpdateMembershipPlanPricingInputVM,
} from '../types';

export const plansApi = {
  /**
   * Retrieves paginated list of membership plans with optional status and search filters.
   */
  async listPlans(params?: ListMembershipPlansFilterParams): Promise<PaginatedMembershipPlansVM> {
    return httpClient.get<PaginatedMembershipPlansVM>('/api/v1/gym/membership-plans', {
      params: {
        activeOnly: params?.activeOnly,
        status: params?.status,
        search: params?.search,
        page: params?.page,
        limit: params?.limit,
      },
    });
  },

  /**
   * Retrieves single membership plan by ID.
   */
  async getPlanById(planId: string): Promise<MembershipPlanVM> {
    return httpClient.get<MembershipPlanVM>(
      `/api/v1/gym/membership-plans/${encodeURIComponent(planId)}`,
    );
  },

  /**
   * Creates a new membership plan (starts in DRAFT status).
   */
  async createPlan(input: CreateMembershipPlanInputVM): Promise<MembershipPlanVM> {
    return httpClient.post<MembershipPlanVM>('/api/v1/gym/membership-plans', input);
  },

  /**
   * Updates commercial pricing for future sales of this plan.
   */
  async updatePricing(
    planId: string,
    input: UpdateMembershipPlanPricingInputVM,
  ): Promise<MembershipPlanVM> {
    return httpClient.patch<MembershipPlanVM>(
      `/api/v1/gym/membership-plans/${encodeURIComponent(planId)}/pricing`,
      input,
    );
  },

  /**
   * Publishes a draft plan to ACTIVE status.
   */
  async publishPlan(planId: string): Promise<MembershipPlanVM> {
    return httpClient.post<MembershipPlanVM>(
      `/api/v1/gym/membership-plans/${encodeURIComponent(planId)}/publish`,
      {},
    );
  },

  /**
   * Archives an active plan to prevent future sales.
   */
  async archivePlan(planId: string): Promise<MembershipPlanVM> {
    return httpClient.post<MembershipPlanVM>(
      `/api/v1/gym/membership-plans/${encodeURIComponent(planId)}/archive`,
      {},
    );
  },
};
