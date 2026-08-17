import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent, Button } from '@kinergy-platform/ui';
import { useClientTreatmentHistory } from '../hooks/use-client-treatment-history';
import { SessionStatusBadge } from './session-status-badge';
import { SessionStatusType } from '../types';

interface TreatmentHistoryListProps {
  clientId: string;
  onSelectSession?: (sessionId: string) => void;
}

export const TreatmentHistoryList: React.FC<TreatmentHistoryListProps> = ({
  clientId,
  onSelectSession,
}) => {
  const [searchParams, setSearchParams] = useSearchParams();

  const currentPage = Number(searchParams.get('page') ?? '1');
  const currentStatus = (searchParams.get('status') as SessionStatusType) || undefined;
  const therapistId = searchParams.get('therapistId') || undefined;

  const { data, isLoading, isError, error } = useClientTreatmentHistory(clientId, {
    page: currentPage,
    limit: 10,
    status: currentStatus,
    therapistId,
  });

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextParams = new URLSearchParams(searchParams);
    const val = e.target.value;
    if (val) {
      nextParams.set('status', val);
    } else {
      nextParams.delete('status');
    }
    nextParams.set('page', '1');
    setSearchParams(nextParams);
  };

  const handlePageChange = (newPage: number) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('page', String(newPage));
    setSearchParams(nextParams);
  };

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <CardTitle className="text-lg font-semibold">Treatment Encounters History</CardTitle>
          <p className="text-sm text-slate-500">
            Chronological log of clinical sessions and recorded SOAP progress summaries.
          </p>
        </div>

        {/* Filter controls */}
        <div className="flex items-center space-x-2">
          <select
            value={currentStatus ?? ''}
            onChange={handleStatusChange}
            className="rounded-md border border-slate-300 p-1.5 text-xs shadow-sm focus:border-indigo-500"
          >
            <option value="">All Statuses</option>
            <option value="COMPLETED">Completed</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
      </CardHeader>

      <CardContent>
        {isLoading && (
          <div className="py-8 text-center text-sm text-slate-500">
            Loading treatment encounters...
          </div>
        )}

        {isError && (
          <div className="py-8 text-center text-sm text-red-600">
            Failed to load treatment history: {error?.message}
          </div>
        )}

        {!isLoading && !isError && (!data || data.items.length === 0) && (
          <div className="py-8 text-center text-sm text-slate-500">
            No treatment sessions recorded for this client.
          </div>
        )}

        {!isLoading && !isError && data && data.items.length > 0 && (
          <div className="space-y-4">
            <div className="divide-y divide-slate-100 rounded-md border border-slate-200">
              {data.items.map((item) => (
                <div
                  key={item.sessionId}
                  className="flex items-center justify-between p-3.5 hover:bg-slate-50 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <SessionStatusBadge status={item.status} />
                      <span className="text-xs text-slate-400">
                        {new Date(item.createdAt).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    {item.notesSummary && (
                      <p className="text-xs text-slate-600 line-clamp-1 italic">
                        "{item.notesSummary}"
                      </p>
                    )}
                  </div>

                  <div className="flex items-center space-x-2">
                    {onSelectSession && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onSelectSession(item.sessionId)}
                      >
                        View Details
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination Controls */}
            {data.totalPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-slate-500">
                  Page {data.page} of {data.totalPages} ({data.total} total encounters)
                </span>
                <div className="flex space-x-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!data.hasPreviousPage}
                    onClick={() => handlePageChange(data.page - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!data.hasNextPage}
                    onClick={() => handlePageChange(data.page + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
