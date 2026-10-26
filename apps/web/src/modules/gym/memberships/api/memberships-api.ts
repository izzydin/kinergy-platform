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
  ExpiringMembershipsResponseVM,
  ExpireMembershipsBatchResponseVM,
  ExpireMembershipsBatchInputVM,
  MemberLookupResultDTO,
} from '../types';

export const membershipsApi = {
  /**
   * Searches clients by name, email, or client ID for membership enrollment.
   */
  async searchClients(
    query: string,
    options?: { signal?: AbortSignal },
  ): Promise<MemberLookupResultDTO[]> {
    if (!query || query.trim().length === 0) {
      return [];
    }
    return httpClient.get<MemberLookupResultDTO[]>('/api/v1/clients/search', {
      params: { q: query.trim() },
      signal: options?.signal,
    });
  },

  /**
   * Lists memberships with multi-criteria filtering and server pagination.
   */
  async listMemberships(
    params?: ListMembershipsFilterParams,
    options?: { signal?: AbortSignal },
  ): Promise<PaginatedMembershipsVM> {
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
      signal: options?.signal,
    });
  },

  /**
   * Retrieves single membership agreement by ID.
   */
  async getMembershipById(
    membershipId: string,
    options?: { signal?: AbortSignal },
  ): Promise<MembershipVM> {
    return httpClient.get<MembershipVM>(
      `/api/v1/gym/memberships/${encodeURIComponent(membershipId)}`,
      options,
    );
  },

  /**
   * Lists memberships expiring within lookahead horizon.
   */
  async getExpiring(
    horizonDays?: number,
    options?: { signal?: AbortSignal },
  ): Promise<ExpiringMembershipsResponseVM> {
    return httpClient.get<ExpiringMembershipsResponseVM>('/api/v1/gym/memberships/expiring', {
      params: { horizonDays },
      signal: options?.signal,
    });
  },

  /**
   * Lists lapsed/expired memberships.
   */
  async getExpired(
    page?: number,
    limit?: number,
    clientId?: string,
    options?: { signal?: AbortSignal },
  ): Promise<PaginatedMembershipsVM> {
    return httpClient.get<PaginatedMembershipsVM>('/api/v1/gym/memberships/expired', {
      params: { page, limit, clientId },
      signal: options?.signal,
    });
  },

  /**
   * Authoritatively checks check-in admission eligibility for a client.
   */
  async checkEligibility(
    clientId: string,
    asOf?: string,
    options?: { signal?: AbortSignal },
  ): Promise<MembershipEligibilityVM> {
    return httpClient.get<MembershipEligibilityVM>('/api/v1/gym/memberships/eligibility/check', {
      params: { clientId, asOf },
      signal: options?.signal,
    });
  },

  /**
   * Creates and activates a new membership agreement.
   */
  async createMembership(
    input: CreateMembershipInputVM,
    options?: { signal?: AbortSignal },
  ): Promise<MembershipVM> {
    return httpClient.post<MembershipVM>('/api/v1/gym/memberships', input, options);
  },

  /**
   * Renews a membership agreement.
   */
  async renewMembership(
    membershipId: string,
    input: RenewMembershipInputVM,
    options?: { signal?: AbortSignal },
  ): Promise<MembershipVM> {
    return httpClient.post<MembershipVM>(
      `/api/v1/gym/memberships/${encodeURIComponent(membershipId)}/renew`,
      input,
      options,
    );
  },

  /**
   * Suspends a membership agreement for a calendar freeze window.
   */
  async freezeMembership(
    membershipId: string,
    input: FreezeMembershipInputVM,
    options?: { signal?: AbortSignal },
  ): Promise<MembershipVM> {
    return httpClient.post<MembershipVM>(
      `/api/v1/gym/memberships/${encodeURIComponent(membershipId)}/freeze`,
      input,
      options,
    );
  },

  /**
   * Resumes a suspended membership early and adjusts duration.
   */
  async unfreezeMembership(
    membershipId: string,
    options?: { signal?: AbortSignal },
  ): Promise<MembershipVM> {
    return httpClient.post<MembershipVM>(
      `/api/v1/gym/memberships/${encodeURIComponent(membershipId)}/unfreeze`,
      {},
      options,
    );
  },

  /**
   * Voluntarily terminates a membership agreement.
   */
  async cancelMembership(
    membershipId: string,
    input: CancelMembershipInputVM,
    options?: { signal?: AbortSignal },
  ): Promise<MembershipVM> {
    return httpClient.post<MembershipVM>(
      `/api/v1/gym/memberships/${encodeURIComponent(membershipId)}/cancel`,
      input,
      options,
    );
  },

  /**
   * Triggers deterministic expiration sweep.
   */
  async expireBatch(
    input?: ExpireMembershipsBatchInputVM,
    options?: { signal?: AbortSignal },
  ): Promise<ExpireMembershipsBatchResponseVM> {
    return httpClient.post<ExpireMembershipsBatchResponseVM>(
      '/api/v1/gym/memberships/expire-batch',
      {
        asOfDate: input?.asOfDate,
        batchSize: input?.batchSize,
        dryRun: input?.dryRun,
      },
      options,
    );
  },
};
