import { ListMembershipPlansFilterParams } from '../types';

export const plansQueryKeys = {
  all: ['gym', 'plans'] as const,
  lists: () => [...plansQueryKeys.all, 'list'] as const,
  list: (params?: ListMembershipPlansFilterParams) =>
    [...plansQueryKeys.lists(), params ?? {}] as const,
  details: () => [...plansQueryKeys.all, 'detail'] as const,
  detail: (planId: string) => [...plansQueryKeys.details(), planId] as const,
};
