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

export function useMemberSearch(query: string) {
  return useQuery({
    queryKey: membershipsQueryKeys.clientSearch(query),
    queryFn: () => membershipsApi.searchClients(query),
    enabled: Boolean(query && query.trim().length >= 2),
    staleTime: 30 * 1000,
  });
}

export function useMembershipMutations() {
  const queryClient = useQueryClient();

  const createMembership = useMutation({
    mutationFn: (input: CreateMembershipInputVM) => membershipsApi.createMembership(input),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: membershipsQueryKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: membershipsQueryKeys.eligibilities(created.clientId),
      });
      queryClient.invalidateQueries({
        queryKey: ['gym', 'attendance', 'eligibility'],
      });
      queryClient.invalidateQueries({ queryKey: ['gym', 'trainer-dashboard'] });
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
    onSuccess: (renewed, variables) => {
      queryClient.invalidateQueries({
        queryKey: membershipsQueryKeys.detail(variables.membershipId),
      });
      queryClient.invalidateQueries({ queryKey: membershipsQueryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: membershipsQueryKeys.expirings() });
      queryClient.invalidateQueries({ queryKey: membershipsQueryKeys.expireds() });
      queryClient.invalidateQueries({
        queryKey: membershipsQueryKeys.eligibilities(renewed.clientId),
      });
      queryClient.invalidateQueries({
        queryKey: ['gym', 'attendance', 'eligibility'],
      });
      queryClient.invalidateQueries({ queryKey: ['gym', 'trainer-dashboard'] });
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
    onSuccess: (frozen, variables) => {
      queryClient.invalidateQueries({
        queryKey: membershipsQueryKeys.detail(variables.membershipId),
      });
      queryClient.invalidateQueries({ queryKey: membershipsQueryKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: membershipsQueryKeys.eligibilities(frozen.clientId),
      });
      queryClient.invalidateQueries({
        queryKey: ['gym', 'attendance', 'eligibility'],
      });
      queryClient.invalidateQueries({ queryKey: ['gym', 'trainer-dashboard'] });
    },
  });

  const unfreezeMembership = useMutation({
    mutationFn: (membershipId: string) => membershipsApi.unfreezeMembership(membershipId),
    onSuccess: (unfrozen, membershipId) => {
      queryClient.invalidateQueries({ queryKey: membershipsQueryKeys.detail(membershipId) });
      queryClient.invalidateQueries({ queryKey: membershipsQueryKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: membershipsQueryKeys.eligibilities(unfrozen.clientId),
      });
      queryClient.invalidateQueries({
        queryKey: ['gym', 'attendance', 'eligibility'],
      });
      queryClient.invalidateQueries({ queryKey: ['gym', 'trainer-dashboard'] });
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
    onSuccess: (cancelled, variables) => {
      queryClient.invalidateQueries({
        queryKey: membershipsQueryKeys.detail(variables.membershipId),
      });
      queryClient.invalidateQueries({ queryKey: membershipsQueryKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: membershipsQueryKeys.eligibilities(cancelled.clientId),
      });
      queryClient.invalidateQueries({
        queryKey: ['gym', 'attendance', 'eligibility'],
      });
      queryClient.invalidateQueries({ queryKey: ['gym', 'trainer-dashboard'] });
    },
  });

  const expireBatch = useMutation({
    mutationFn: (vars?: { asOfDate?: string; batchSize?: number; dryRun?: boolean }) =>
      membershipsApi.expireBatch(vars),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: membershipsQueryKeys.all });
      queryClient.invalidateQueries({
        queryKey: ['gym', 'attendance', 'eligibility'],
      });
      queryClient.invalidateQueries({ queryKey: ['gym', 'trainer-dashboard'] });
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
