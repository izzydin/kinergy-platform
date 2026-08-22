import React from 'react';
import { useTodayAttendance } from '../hooks/use-gym-attendance';

export const AttendancePage: React.FC = () => {
  const { data, isLoading, isError, error } = useTodayAttendance({ page: 1, limit: 20 });

  return (
    <div className="p-6 space-y-6" data-testid="attendance-page">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Gym Attendance & Ingress</h1>
          <p className="text-sm text-gray-500">
            Real-time facility check-ins and admission control
          </p>
        </div>
      </div>

      {isLoading && <div className="text-sm text-gray-500">Loading daily attendance...</div>}
      {isError && <div className="text-sm text-red-500">Error: {(error as Error)?.message}</div>}

      {data && (
        <div className="space-y-4">
          {data.dailySummary && (
            <div className="grid grid-cols-4 gap-4" data-testid="daily-summary-cards">
              <div className="p-4 border rounded bg-white">
                <div className="text-xs text-gray-500">Total Check-Ins</div>
                <div className="text-xl font-bold">{data.dailySummary.totalCheckIns}</div>
              </div>
              <div className="p-4 border rounded bg-white">
                <div className="text-xs text-gray-500">Granted</div>
                <div className="text-xl font-bold text-green-600">
                  {data.dailySummary.grantedCount}
                </div>
              </div>
              <div className="p-4 border rounded bg-white">
                <div className="text-xs text-gray-500">Denied</div>
                <div className="text-xl font-bold text-red-600">
                  {data.dailySummary.deniedCount}
                </div>
              </div>
              <div className="p-4 border rounded bg-white">
                <div className="text-xs text-gray-500">Unique Clients</div>
                <div className="text-xl font-bold">{data.dailySummary.uniqueClientsCount}</div>
              </div>
            </div>
          )}

          <div
            className="border rounded-lg overflow-hidden bg-white"
            data-testid="attendance-table-container"
          >
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Time</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Client ID</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Method</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {data.items.map((item) => (
                  <tr key={item.id} data-testid={`attendance-row-${item.id}`}>
                    <td className="px-4 py-3 text-xs font-mono">
                      {new Date(item.checkInTime).toLocaleTimeString()}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono">{item.clientId}</td>
                    <td className="px-4 py-3 text-xs">{item.method}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded font-semibold ${
                          item.result === 'GRANTED'
                            ? 'bg-green-50 text-green-700'
                            : 'bg-red-50 text-red-700'
                        }`}
                      >
                        {item.result}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
