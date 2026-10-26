import { ListMembershipsFilterParams } from '../types';

export const membershipsQueryKeys = {
  all: ['gym', 'memberships'] as const,
  lists: () => [...membershipsQueryKeys.all, 'list'] as const,
  list: (params?: ListMembershipsFilterParams) =>
    [...membershipsQueryKeys.lists(), params ?? {}] as const,
  details: () => [...membershipsQueryKeys.all, 'detail'] as const,
  detail: (membershipId: string) => [...membershipsQueryKeys.details(), membershipId] as const,
  expirings: () => [...membershipsQueryKeys.all, 'expiring'] as const,
  expiring: (horizonDays?: number) =>
    [...membershipsQueryKeys.all, 'expiring', horizonDays ?? 7] as const,
  expireds: () => [...membershipsQueryKeys.all, 'expired'] as const,
  expired: (page?: number, limit?: number, clientId?: string) =>
    [...membershipsQueryKeys.all, 'expired', { page, limit, clientId }] as const,
  eligibilities: (clientId?: string) =>
    clientId
      ? ([...membershipsQueryKeys.all, 'eligibility', clientId] as const)
      : ([...membershipsQueryKeys.all, 'eligibility'] as const),
  eligibility: (clientId: string, asOf?: string) =>
    [...membershipsQueryKeys.all, 'eligibility', clientId, asOf ?? 'now'] as const,
  clientSearches: () => [...membershipsQueryKeys.all, 'client-search'] as const,
  clientSearch: (query: string) => [...membershipsQueryKeys.all, 'client-search', query] as const,
};
