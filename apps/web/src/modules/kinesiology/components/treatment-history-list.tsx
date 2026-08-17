import React from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  StateView,
  Skeleton,
} from '@kinergy-platform/ui';
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

  const currentPage = Math.max(1, Number(searchParams.get('page') ?? '1'));
  const currentStatus = (searchParams.get('status') as SessionStatusType) || undefined;
  const therapistId = searchParams.get('therapistId') || undefined;
  const dateFrom = searchParams.get('dateFrom') || undefined;
  const dateTo = searchParams.get('dateTo') || undefined;

  const { data, isLoading, isError, error, refetch } = useClientTreatmentHistory(clientId, {
    page: currentPage,
    limit: 10,
    status: currentStatus,
    therapistId,
    dateFrom,
    dateTo,
  });

  const updateFilters = (newParams: Record<string, string | undefined>) => {
    const nextParams = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(newParams)) {
      if (value && value.trim().length > 0) {
        nextParams.set(key, value);
      } else {
        nextParams.delete(key);
      }
    }
    nextParams.set('page', '1');
    setSearchParams(nextParams);
  };

  const handlePageChange = (newPage: number) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('page', String(newPage));
    setSearchParams(nextParams);
  };

  const handleClearFilters = () => {
    const nextParams = new URLSearchParams();
    nextParams.set('page', '1');
    setSearchParams(nextParams);
  };

  const hasActiveFilters = Boolean(currentStatus || therapistId || dateFrom || dateTo);

  return (
    <Card className="w-full shadow-sm border-slate-200">
      <CardHeader className="space-y-4 pb-4 border-b border-slate-100">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <CardTitle className="text-xl font-bold text-slate-900">
              Clinical Treatment History
            </CardTitle>
            <p className="text-sm text-slate-500 mt-0.5">
              Longitudinal log of kinesiology encounters, muscle assessments, and SOAP clinical
              notes.
            </p>
          </div>
          {hasActiveFilters && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearFilters}
              className="self-start sm:self-auto text-xs"
            >
              Clear Filters
            </Button>
          )}
        </div>

        {/* Business Value Filter Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-2">
          {/* Status Filter */}
          <div className="space-y-1">
            <label
              htmlFor="filter-status"
              className="text-xs font-semibold text-slate-600 uppercase tracking-wider"
            >
              Session Status
            </label>
            <select
              id="filter-status"
              value={currentStatus ?? ''}
              onChange={(e) => updateFilters({ status: e.target.value || undefined })}
              className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">All Statuses</option>
              <option value="COMPLETED">Completed</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="SCHEDULED">Scheduled</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>

          {/* Date From */}
          <div className="space-y-1">
            <label
              htmlFor="filter-date-from"
              className="text-xs font-semibold text-slate-600 uppercase tracking-wider"
            >
              Date From
            </label>
            <input
              id="filter-date-from"
              type="date"
              value={dateFrom ?? ''}
              onChange={(e) => updateFilters({ dateFrom: e.target.value || undefined })}
              className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Date To */}
          <div className="space-y-1">
            <label
              htmlFor="filter-date-to"
              className="text-xs font-semibold text-slate-600 uppercase tracking-wider"
            >
              Date To
            </label>
            <input
              id="filter-date-to"
              type="date"
              value={dateTo ?? ''}
              onChange={(e) => updateFilters({ dateTo: e.target.value || undefined })}
              className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Therapist ID filter */}
          <div className="space-y-1">
            <label
              htmlFor="filter-therapist"
              className="text-xs font-semibold text-slate-600 uppercase tracking-wider"
            >
              Therapist UUID
            </label>
            <input
              id="filter-therapist"
              type="text"
              placeholder="Search therapist..."
              value={therapistId ?? ''}
              onChange={(e) => updateFilters({ therapistId: e.target.value || undefined })}
              className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        <StateView
          isLoading={isLoading}
          loadingFallback={
            <div className="space-y-3 p-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          }
          isEmpty={!isLoading && !isError && (!data || data.items.length === 0)}
          emptyTitle="No Treatment Sessions Found"
          emptyDescription={
            hasActiveFilters
              ? 'No clinical records match your specified filter criteria. Try adjusting date ranges or status filters.'
              : 'This client does not have any recorded kinesiology treatment sessions yet.'
          }
          isError={isError}
          errorMessage={error?.message || 'Failed to retrieve clinical treatment history.'}
          onRetry={() => refetch()}
        >
          {data && data.items.length > 0 && (
            <div className="space-y-4">
              {/* Semantic Responsive Data Table */}
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table
                  className="w-full text-left border-collapse"
                  aria-label="Client Treatment History Encounters"
                >
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs uppercase font-semibold">
                    <tr>
                      <th scope="col" className="py-3 px-4">
                        Session Date
                      </th>
                      <th scope="col" className="py-3 px-4">
                        Status
                      </th>
                      <th scope="col" className="py-3 px-4">
                        Assigned Therapist
                      </th>
                      <th scope="col" className="py-3 px-4">
                        Appointment Ref
                      </th>
                      <th scope="col" className="py-3 px-4">
                        Clinical Progress Summary
                      </th>
                      <th scope="col" className="py-3 px-4 text-right">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm text-slate-800 bg-white">
                    {data.items.map((session) => (
                      <tr
                        key={session.sessionId}
                        className="hover:bg-slate-50/80 transition-colors"
                      >
                        {/* Date */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="font-medium text-slate-900">
                            {new Date(session.createdAt).toLocaleDateString(undefined, {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </div>
                          <div className="text-xs text-slate-400">
                            {new Date(session.createdAt).toLocaleTimeString(undefined, {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <SessionStatusBadge status={session.status} />
                        </td>

                        {/* Therapist */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className="font-mono text-xs text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                            {session.therapistId}
                          </span>
                        </td>

                        {/* Appointment */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className="font-mono text-xs text-slate-600">
                            {session.appointmentId}
                          </span>
                        </td>

                        {/* Summary */}
                        <td className="py-3.5 px-4 max-w-xs">
                          {session.notesSummary ? (
                            <p className="text-xs text-slate-600 italic line-clamp-2">
                              "{session.notesSummary}"
                            </p>
                          ) : (
                            <span className="text-xs text-slate-400">
                              {session.hasFullNotes
                                ? 'Full SOAP notes recorded'
                                : 'No notes entered'}
                            </span>
                          )}
                        </td>

                        {/* Action */}
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onSelectSession?.(session.sessionId)}
                            aria-label={`View treatment session ${session.sessionId}`}
                          >
                            View Session
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Bounded Pagination Controls */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-2 border-t border-slate-100">
                <p className="text-xs text-slate-500">
                  Showing page <span className="font-semibold text-slate-700">{data.page}</span> of{' '}
                  <span className="font-semibold text-slate-700">{data.totalPages}</span> (
                  {data.total} total sessions)
                </p>
                <div className="flex space-x-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!data.hasPreviousPage}
                    onClick={() => handlePageChange(data.page - 1)}
                    aria-label="Go to previous page"
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!data.hasNextPage}
                    onClick={() => handlePageChange(data.page + 1)}
                    aria-label="Go to next page"
                  >
                    Next
                  </Button>
                </div>
              </div>
            </div>
          )}
        </StateView>
      </CardContent>
    </Card>
  );
};
