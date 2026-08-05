import React from 'react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
} from '@kinergy-platform/ui';
import { useDashboardActivities } from '../api/dashboard-queries';

interface DashboardActivitySectionProps {
  readonly simulationState: 'success' | 'loading' | 'empty' | 'error';
  readonly onRetry?: () => void;
}

export const DashboardActivitySection: React.FC<DashboardActivitySectionProps> = ({
  simulationState,
  onRetry,
}) => {
  const {
    data: activities,
    isLoading,
    isError,
    error,
    refetch,
  } = useDashboardActivities(simulationState);

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Recent Platform Activity</CardTitle>
        <CardDescription>
          Asynchronous security and telemetry audit log (4-State UI Verification).
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* 1. LOADING STATE */}
        {(simulationState === 'loading' || isLoading) && (
          <div className="space-y-3" data-testid="activity-loading">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={`skel-act-${i}`}
                className="flex items-center justify-between py-2 border-b border-border"
              >
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        )}

        {/* 2. ERROR STATE */}
        {(simulationState === 'error' || isError) && (
          <Alert variant="destructive" data-testid="activity-error">
            <AlertTitle>Activity Feed Failure</AlertTitle>
            <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>{error?.message ?? 'Failed to retrieve activity stream.'}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (onRetry) onRetry();
                  refetch();
                }}
              >
                Retry Activity Stream
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* 3. EMPTY STATE */}
        {simulationState !== 'loading' &&
          simulationState !== 'error' &&
          !isLoading &&
          !isError &&
          (simulationState === 'empty' || !activities || activities.length === 0) && (
            <Alert variant="default" data-testid="activity-empty">
              <AlertTitle>No Activity Recorded</AlertTitle>
              <AlertDescription>
                No recent events or security audit entries in this interval.
              </AlertDescription>
            </Alert>
          )}

        {/* 4. SUCCESS STATE */}
        {simulationState === 'success' &&
          !isLoading &&
          !isError &&
          activities &&
          activities.length > 0 && (
            <div className="space-y-3" data-testid="activity-success">
              {activities.map((act) => (
                <div
                  key={act.id}
                  className="flex flex-col justify-between gap-1 border-border border-b pb-2 last:border-0 last:pb-0 sm:flex-row sm:items-center"
                >
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        act.type === 'error'
                          ? 'destructive'
                          : act.type === 'warning'
                            ? 'outline'
                            : 'secondary'
                      }
                    >
                      {act.type.toUpperCase()}
                    </Badge>
                    <span className="text-foreground text-sm font-medium">{act.title}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{act.timestamp}</span>
                </div>
              ))}
            </div>
          )}
      </CardContent>
    </Card>
  );
};
