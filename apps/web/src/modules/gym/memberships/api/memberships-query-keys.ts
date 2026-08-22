import { ListMembershipsFilterParams } from '../types';

export const membershipsQueryKeys = {
  all: ['gym', 'memberships'] as const,
  lists: () => [...membershipsQueryKeys.all, 'list'] as const,
  list: (params?: ListMembershipsFilterParams) =>
    [...membershipsQueryKeys.lists(), params ?? {}] as const,
  details: () => [...membershipsQueryKeys.all, 'detail'] as const,
  detail: (membershipId: string) => [...membershipsQueryKeys.details(), membershipId] as const,
  expiring: (horizonDays?: number) =>
    [...membershipsQueryKeys.all, 'expiring', horizonDays ?? 7] as const,
  expired: (page?: number, limit?: number, clientId?: string) =>
    [...membershipsQueryKeys.all, 'expired', { page, limit, clientId }] as const,
  eligibility: (clientId: string, asOf?: string) =>
    [...membershipsQueryKeys.all, 'eligibility', clientId, asOf ?? 'now'] as const,
};
