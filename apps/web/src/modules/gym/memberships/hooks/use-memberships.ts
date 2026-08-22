import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { membershipsApi } from '../api/memberships-api';
import { membershipsQueryKeys } from '../api/memberships-query-keys';
import {
  ListMembershipsFilterParams,
  CreateMembershipInputVM,
  RenewMembershipInputVM,
  FreezeMembershipInputVM,
  CancelMembershipInputVM,
} from '../types';

export function useMemberships(params?: ListMembershipsFilterParams) {
  return useQuery({
    queryKey: membershipsQueryKeys.list(params),
    queryFn: () => membershipsApi.listMemberships(params),
    staleTime: 30 * 1000,
  });
}

export function useMembershipDetail(membershipId: string) {
  return useQuery({
    queryKey: membershipsQueryKeys.detail(membershipId),
    queryFn: () => membershipsApi.getMembershipById(membershipId),
    enabled: Boolean(membershipId && membershipId.trim().length > 0),
    staleTime: 60 * 1000,
  });
}

export function useExpiringMemberships(horizonDays?: number) {
  return useQuery({
    queryKey: membershipsQueryKeys.expiring(horizonDays),
    queryFn: () => membershipsApi.getExpiring(horizonDays),
    staleTime: 60 * 1000,
  });
}

export function useExpiredMemberships(page?: number, limit?: number, clientId?: string) {
  return useQuery({
    queryKey: membershipsQueryKeys.expired(page, limit, clientId),
    queryFn: () => membershipsApi.getExpired(page, limit, clientId),
    staleTime: 60 * 1000,
  });
}

export function useMembershipEligibility(clientId: string, asOf?: string) {
  return useQuery({
    queryKey: membershipsQueryKeys.eligibility(clientId, asOf),
    queryFn: () => membershipsApi.checkEligibility(clientId, asOf),
    enabled: Boolean(clientId && clientId.trim().length > 0),
    staleTime: 10 * 1000,
  });
}

export function useMembershipMutations() {
  const queryClient = useQueryClient();

  const createMembership = useMutation({
    mutationFn: (input: CreateMembershipInputVM) => membershipsApi.createMembership(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: membershipsQueryKeys.all });
    },
  });

  const renewMembership = useMutation({
    mutationFn: ({
      membershipId,
      input,
    }: {
      membershipId: string;
      input: RenewMembershipInputVM;
    }) => membershipsApi.renewMembership(membershipId, input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: membershipsQueryKeys.detail(variables.membershipId),
      });
      queryClient.invalidateQueries({ queryKey: membershipsQueryKeys.lists() });
    },
  });

  const freezeMembership = useMutation({
    mutationFn: ({
      membershipId,
      input,
    }: {
      membershipId: string;
      input: FreezeMembershipInputVM;
    }) => membershipsApi.freezeMembership(membershipId, input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: membershipsQueryKeys.detail(variables.membershipId),
      });
      queryClient.invalidateQueries({ queryKey: membershipsQueryKeys.lists() });
    },
  });

  const unfreezeMembership = useMutation({
    mutationFn: (membershipId: string) => membershipsApi.unfreezeMembership(membershipId),
    onSuccess: (_, membershipId) => {
      queryClient.invalidateQueries({ queryKey: membershipsQueryKeys.detail(membershipId) });
      queryClient.invalidateQueries({ queryKey: membershipsQueryKeys.lists() });
    },
  });

  const cancelMembership = useMutation({
    mutationFn: ({
      membershipId,
      input,
    }: {
      membershipId: string;
      input: CancelMembershipInputVM;
    }) => membershipsApi.cancelMembership(membershipId, input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: membershipsQueryKeys.detail(variables.membershipId),
      });
      queryClient.invalidateQueries({ queryKey: membershipsQueryKeys.lists() });
    },
  });

  const expireBatch = useMutation({
    mutationFn: (vars?: { asOfDate?: string; batchSize?: number; dryRun?: boolean }) =>
      membershipsApi.expireBatch(vars?.asOfDate, vars?.batchSize, vars?.dryRun),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: membershipsQueryKeys.all });
    },
  });

  return {
    createMembership,
    renewMembership,
    freezeMembership,
    unfreezeMembership,
    cancelMembership,
    expireBatch,
  };
}
