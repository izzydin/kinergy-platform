import React from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Badge,
  StateView,
  Skeleton,
} from '@kinergy-platform/ui';
import { useClientTimeline } from '../hooks/use-client-timeline';
import { ClientTimelineEntryModel } from '../types';

interface ClientTimelineListProps {
  clientId: string;
}

export const ClientTimelineList: React.FC<ClientTimelineListProps> = ({ clientId }) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const currentPage = Math.max(1, Number(searchParams.get('page') ?? '1'));

  const { data, isLoading, isError, error, refetch } = useClientTimeline(clientId, {
    page: currentPage,
    limit: 10,
  });

  const handlePageChange = (newPage: number) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('page', String(newPage));
    setSearchParams(nextParams);
  };

  const renderEventBadge = (entry: ClientTimelineEntryModel) => {
    if (entry.sourceModule === 'kinesiology' || entry.eventType === 'TreatmentSessionCompleted') {
      return <Badge variant="secondary">Treatment Session Completed</Badge>;
    }

    if (entry.eventType === 'CLIENT_CREATED') {
      return <Badge variant="default">Client Profile Created</Badge>;
    }

    if (entry.eventType === 'CLIENT_ARCHIVED') {
      return <Badge variant="destructive">Client Archived</Badge>;
    }

    return <Badge variant="outline">{entry.eventType}</Badge>;
  };

  return (
    <Card className="w-full shadow-sm border-slate-200">
      <CardHeader className="space-y-1 pb-4 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-xl font-bold text-slate-900">
              Longitudinal Activity Timeline
            </CardTitle>
            <p className="text-sm text-slate-500 mt-0.5">
              Chronological cross-context audit log of appointments, client milestones, and
              completed treatment sessions.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            aria-label="Refresh timeline"
          >
            Refresh Timeline
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-6">
        <StateView
          isLoading={isLoading}
          loadingFallback={
            <div className="space-y-4 p-4">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          }
          isEmpty={!isLoading && !isError && (!data || data.items.length === 0)}
          emptyTitle="No Activity Timeline Entries"
          emptyDescription="No events or completed treatment sessions have been projected for this client yet."
          isError={isError}
          errorMessage={error?.message || 'Failed to retrieve client activity timeline.'}
          onRetry={() => refetch()}
        >
          {data && data.items.length > 0 && (
            <div className="space-y-6">
              {/* Chronological Event Stream */}
              <div className="relative border-l-2 border-slate-200 ml-4 space-y-6">
                {data.items.map((entry) => {
                  const isKinesiology =
                    entry.sourceModule === 'kinesiology' ||
                    entry.eventType === 'TreatmentSessionCompleted';

                  return (
                    <div key={entry.id} className="relative pl-6">
                      {/* Timeline Dot Indicator */}
                      <span
                        className={`absolute -left-2 top-1.5 h-3.5 w-3.5 rounded-full border-2 border-white ${
                          isKinesiology ? 'bg-indigo-600' : 'bg-slate-400'
                        }`}
                      />

                      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-300 transition-colors space-y-2">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                          <div className="flex items-center space-x-2">
                            {renderEventBadge(entry)}
                            <span className="text-xs text-slate-400">
                              {new Date(entry.occurredAt).toLocaleDateString(undefined, {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>

                          {/* Kinesiology Treatment Session CTA */}
                          {isKinesiology && entry.metadata?.sessionId && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                navigate(`/kinesiology/sessions/${entry.metadata.sessionId}`)
                              }
                              aria-label={`View treatment session ${entry.metadata.sessionId}`}
                              className="self-start sm:self-auto text-xs"
                            >
                              View Treatment Session
                            </Button>
                          )}
                        </div>

                        {/* Event Summary */}
                        <p className="text-sm font-medium text-slate-800">{entry.summary}</p>

                        {/* Approved Metadata (Zero Clinical Notes Exposed) */}
                        {isKinesiology && (
                          <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-slate-500">
                            {entry.metadata?.therapistId && (
                              <span>
                                Therapist:{' '}
                                <strong className="font-mono text-slate-700">
                                  {String(entry.metadata.therapistId)}
                                </strong>
                              </span>
                            )}
                            {entry.metadata?.appointmentId && (
                              <span>
                                Appointment:{' '}
                                <strong className="font-mono text-slate-700">
                                  {String(entry.metadata.appointmentId)}
                                </strong>
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Bounded Pagination Controls */}
              {data.totalPages > 1 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-4 border-t border-slate-100">
                  <p className="text-xs text-slate-500">
                    Showing page <span className="font-semibold text-slate-700">{data.page}</span>{' '}
                    of <span className="font-semibold text-slate-700">{data.totalPages}</span> (
                    {data.total} total events)
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
              )}
            </div>
          )}
        </StateView>
      </CardContent>
    </Card>
  );
};
