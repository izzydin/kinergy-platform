import { httpClient } from '../../../../shared/api/http-client';
import {
  MembershipVM,
  ListMembershipsFilterParams,
  PaginatedMembershipsVM,
  MembershipEligibilityVM,
  CreateMembershipInputVM,
  RenewMembershipInputVM,
  FreezeMembershipInputVM,
  CancelMembershipInputVM,
} from '../types';

export const membershipsApi = {
  /**
   * Lists memberships with multi-criteria filtering and server pagination.
   */
  async listMemberships(params?: ListMembershipsFilterParams): Promise<PaginatedMembershipsVM> {
    return httpClient.get<PaginatedMembershipsVM>('/api/v1/gym/memberships', {
      params: {
        clientId: params?.clientId,
        planId: params?.planId,
        status: params?.status,
        startDateFrom: params?.startDateFrom,
        startDateTo: params?.startDateTo,
        endDateFrom: params?.endDateFrom,
        endDateTo: params?.endDateTo,
        page: params?.page,
        limit: params?.limit,
      },
    });
  },

  /**
   * Retrieves single membership agreement by ID.
   */
  async getMembershipById(membershipId: string): Promise<MembershipVM> {
    return httpClient.get<MembershipVM>(
      `/api/v1/gym/memberships/${encodeURIComponent(membershipId)}`,
    );
  },

  /**
   * Lists memberships expiring within lookahead horizon.
   */
  async getExpiring(
    horizonDays?: number,
  ): Promise<{ items: MembershipVM[]; total: number; horizonDays: number }> {
    return httpClient.get<{ items: MembershipVM[]; total: number; horizonDays: number }>(
      '/api/v1/gym/memberships/expiring',
      {
        params: { horizonDays },
      },
    );
  },

  /**
   * Lists lapsed/expired memberships.
   */
  async getExpired(
    page?: number,
    limit?: number,
    clientId?: string,
  ): Promise<PaginatedMembershipsVM> {
    return httpClient.get<PaginatedMembershipsVM>('/api/v1/gym/memberships/expired', {
      params: { page, limit, clientId },
    });
  },

  /**
   * Authoritatively checks check-in admission eligibility for a client.
   */
  async checkEligibility(clientId: string, asOf?: string): Promise<MembershipEligibilityVM> {
    return httpClient.get<MembershipEligibilityVM>('/api/v1/gym/memberships/eligibility/check', {
      params: { clientId, asOf },
    });
  },

  /**
   * Creates and activates a new membership agreement.
   */
  async createMembership(input: CreateMembershipInputVM): Promise<MembershipVM> {
    return httpClient.post<MembershipVM>('/api/v1/gym/memberships', input);
  },

  /**
   * Renews a membership agreement.
   */
  async renewMembership(
    membershipId: string,
    input: RenewMembershipInputVM,
  ): Promise<MembershipVM> {
    return httpClient.post<MembershipVM>(
      `/api/v1/gym/memberships/${encodeURIComponent(membershipId)}/renew`,
      input,
    );
  },

  /**
   * Suspends a membership agreement for a calendar freeze window.
   */
  async freezeMembership(
    membershipId: string,
    input: FreezeMembershipInputVM,
  ): Promise<MembershipVM> {
    return httpClient.post<MembershipVM>(
      `/api/v1/gym/memberships/${encodeURIComponent(membershipId)}/freeze`,
      input,
    );
  },

  /**
   * Resumes a suspended membership early and adjusts duration.
   */
  async unfreezeMembership(membershipId: string): Promise<MembershipVM> {
    return httpClient.post<MembershipVM>(
      `/api/v1/gym/memberships/${encodeURIComponent(membershipId)}/unfreeze`,
      {},
    );
  },

  /**
   * Voluntarily terminates a membership agreement.
   */
  async cancelMembership(
    membershipId: string,
    input: CancelMembershipInputVM,
  ): Promise<MembershipVM> {
    return httpClient.post<MembershipVM>(
      `/api/v1/gym/memberships/${encodeURIComponent(membershipId)}/cancel`,
      input,
    );
  },

  /**
   * Triggers deterministic expiration sweep.
   */
  async expireBatch(
    asOfDate?: string,
    batchSize?: number,
    dryRun?: boolean,
  ): Promise<{ expiredCount: number; processedCount: number }> {
    return httpClient.post<{ expiredCount: number; processedCount: number }>(
      '/api/v1/gym/memberships/expire-batch',
      {
        asOfDate,
        batchSize,
        dryRun,
      },
    );
  },
};
