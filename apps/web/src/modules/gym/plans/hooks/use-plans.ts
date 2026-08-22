import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { plansApi } from '../api/plans-api';
import { plansQueryKeys } from '../api/plans-query-keys';
import {
  ListMembershipPlansFilterParams,
  CreateMembershipPlanInputVM,
  UpdateMembershipPlanPricingInputVM,
} from '../types';

export function usePlans(params?: ListMembershipPlansFilterParams) {
  return useQuery({
    queryKey: plansQueryKeys.list(params),
    queryFn: () => plansApi.listPlans(params),
    staleTime: 30 * 1000,
  });
}

export function usePlanDetail(planId: string) {
  return useQuery({
    queryKey: plansQueryKeys.detail(planId),
    queryFn: () => plansApi.getPlanById(planId),
    enabled: Boolean(planId && planId.trim().length > 0),
    staleTime: 60 * 1000,
  });
}

export function usePlanMutations() {
  const queryClient = useQueryClient();

  const createPlan = useMutation({
    mutationFn: (input: CreateMembershipPlanInputVM) => plansApi.createPlan(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: plansQueryKeys.all });
    },
  });

  const updatePricing = useMutation({
    mutationFn: ({
      planId,
      input,
    }: {
      planId: string;
      input: UpdateMembershipPlanPricingInputVM;
    }) => plansApi.updatePricing(planId, input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: plansQueryKeys.detail(variables.planId) });
      queryClient.invalidateQueries({ queryKey: plansQueryKeys.lists() });
    },
  });

  const publishPlan = useMutation({
    mutationFn: (planId: string) => plansApi.publishPlan(planId),
    onSuccess: (_, planId) => {
      queryClient.invalidateQueries({ queryKey: plansQueryKeys.detail(planId) });
      queryClient.invalidateQueries({ queryKey: plansQueryKeys.lists() });
    },
  });

  const archivePlan = useMutation({
    mutationFn: (planId: string) => plansApi.archivePlan(planId),
    onSuccess: (_, planId) => {
      queryClient.invalidateQueries({ queryKey: plansQueryKeys.detail(planId) });
      queryClient.invalidateQueries({ queryKey: plansQueryKeys.lists() });
    },
  });

  return {
    createPlan,
    updatePricing,
    publishPlan,
    archivePlan,
  };
}
