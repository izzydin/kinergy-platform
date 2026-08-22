import React from 'react';
import { useMemberships } from '../hooks/use-memberships';

export const MembershipsListPage: React.FC = () => {
  const { data, isLoading, isError, error } = useMemberships({ page: 1, limit: 20 });

  return (
    <div className="p-6 space-y-6" data-testid="memberships-list-page">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Gym Memberships</h1>
          <p className="text-sm text-gray-500">
            Client membership agreements and subscription lifecycle
          </p>
        </div>
      </div>

      {isLoading && <div className="text-sm text-gray-500">Loading memberships...</div>}
      {isError && <div className="text-sm text-red-500">Error: {(error as Error)?.message}</div>}

      {data && (
        <div
          className="border rounded-lg overflow-hidden bg-white"
          data-testid="memberships-table-container"
        >
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Client ID</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Plan ID</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Validity Period</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {data.items.map((membership) => (
                <tr key={membership.id} data-testid={`membership-row-${membership.id}`}>
                  <td className="px-4 py-3 font-mono text-xs">{membership.clientId}</td>
                  <td className="px-4 py-3 font-mono text-xs">{membership.planId}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">
                    {new Date(membership.period.startDate).toLocaleDateString()} -{' '}
                    {new Date(membership.period.endDate).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-0.5 rounded uppercase font-semibold bg-blue-50 text-blue-700">
                      {membership.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
