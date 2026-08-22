import React from 'react';
import { usePlans } from '../hooks/use-plans';

export const PlansListPage: React.FC = () => {
  const { data, isLoading, isError, error } = usePlans({ page: 1, limit: 20 });

  return (
    <div className="p-6 space-y-6" data-testid="plans-list-page">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Membership Plans</h1>
          <p className="text-sm text-gray-500">Commercial membership plans and pricing catalog</p>
        </div>
      </div>

      {isLoading && <div className="text-sm text-gray-500">Loading membership plans...</div>}
      {isError && <div className="text-sm text-red-500">Error: {(error as Error)?.message}</div>}

      {data && (
        <div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
          data-testid="plans-grid"
        >
          {data.items.map((plan) => (
            <div
              key={plan.id}
              className="p-4 border rounded-lg shadow-sm space-y-2 bg-white"
              data-testid={`plan-card-${plan.id}`}
            >
              <div className="flex justify-between items-center">
                <span className="font-semibold">{plan.name}</span>
                <span className="text-xs px-2 py-0.5 rounded bg-gray-100 uppercase">
                  {plan.status}
                </span>
              </div>
              <p className="text-xs text-gray-400 font-mono">{plan.code}</p>
              <div className="text-lg font-bold">
                ${(plan.priceAmount / 100).toFixed(2)} {plan.priceCurrency}
              </div>
              <div className="text-xs text-gray-500">{plan.durationInDays} days access</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
