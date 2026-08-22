import React from 'react';
import { useParams } from 'react-router-dom';
import { usePlanDetail } from '../hooks/use-plans';

export const PlanDetailPage: React.FC = () => {
  const { planId = '' } = useParams<{ planId: string }>();
  const { data: plan, isLoading, isError, error } = usePlanDetail(planId);

  if (isLoading) {
    return <div className="p-6 text-sm text-gray-500">Loading plan details...</div>;
  }

  if (isError || !plan) {
    return (
      <div className="p-6 text-sm text-red-500">
        Error loading plan: {(error as Error)?.message ?? 'Not found'}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4" data-testid="plan-detail-page">
      <h1 className="text-2xl font-bold">{plan.name}</h1>
      <p className="text-sm font-mono text-gray-500">Code: {plan.code}</p>
      <div className="text-lg font-bold">${(plan.priceAmount / 100).toFixed(2)}</div>
      <div className="text-sm">
        Status: <span className="font-semibold">{plan.status}</span>
      </div>
      <div className="text-sm">Duration: {plan.durationInDays} days</div>
    </div>
  );
};
