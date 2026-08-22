import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createMembershipSchema, CreateMembershipFormValues } from '../schemas/membership.schema';
import { useMembershipMutations } from '../hooks/use-memberships';

export const CreateMembershipPage: React.FC = () => {
  const { createMembership } = useMembershipMutations();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateMembershipFormValues>({
    resolver: zodResolver(createMembershipSchema),
  });

  const onSubmit = (values: CreateMembershipFormValues) => {
    createMembership.mutate(values);
  };

  return (
    <div className="p-6 max-w-xl space-y-6" data-testid="create-membership-page">
      <h1 className="text-2xl font-bold">New Membership Agreement</h1>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold uppercase mb-1">Client ID</label>
          <input
            {...register('clientId')}
            className="w-full p-2 border rounded text-sm"
            placeholder="cli_..."
            data-testid="input-client-id"
          />
          {errors.clientId && (
            <p className="text-xs text-red-500 mt-1">{errors.clientId.message}</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase mb-1">Plan ID</label>
          <input
            {...register('planId')}
            className="w-full p-2 border rounded text-sm"
            placeholder="plan_..."
            data-testid="input-plan-id"
          />
          {errors.planId && <p className="text-xs text-red-500 mt-1">{errors.planId.message}</p>}
        </div>

        <button
          type="submit"
          disabled={createMembership.isPending}
          className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
          data-testid="submit-membership-button"
        >
          {createMembership.isPending ? 'Creating...' : 'Create Membership'}
        </button>
      </form>
    </div>
  );
};
