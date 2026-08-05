import React from 'react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
} from '@kinergy-platform/ui';
import { useDashboardMetrics } from '../api/dashboard-queries';

interface DashboardMetricsSectionProps {
  readonly simulationState: 'success' | 'loading' | 'empty' | 'error';
  readonly onRetry?: () => void;
}

export const DashboardMetricsSection: React.FC<DashboardMetricsSectionProps> = ({
  simulationState,
  onRetry,
}) => {
  const {
    data: metrics,
    isLoading,
    isError,
    error,
    refetch,
  } = useDashboardMetrics(simulationState);

  // 1. LOADING STATE
  if (simulationState === 'loading' || isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4" data-testid="metrics-loading">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={`skeleton-metric-${i}`}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-5 w-12 rounded-full" />
            </CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-8 w-28" />
              <Skeleton className="h-3 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  // 2. ERROR STATE
  if (simulationState === 'error' || isError) {
    return (
      <Alert variant="destructive" data-testid="metrics-error">
        <AlertTitle>Metrics Data Error</AlertTitle>
        <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span>{error?.message ?? 'Failed to load telemetry metrics.'}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (onRetry) onRetry();
              refetch();
            }}
          >
            Retry Fetching
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  // 3. EMPTY STATE
  if (simulationState === 'empty' || !metrics || metrics.length === 0) {
    return (
      <Alert variant="default" data-testid="metrics-empty">
        <AlertTitle>No Metrics Recorded</AlertTitle>
        <AlertDescription>
          No active telemetry monitors are registered for this workspace context.
        </AlertDescription>
      </Alert>
    );
  }

  // 4. SUCCESS STATE
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4" data-testid="metrics-success">
      {metrics.map((item) => (
        <Card key={item.id}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm text-muted-foreground">
              {item.title}
            </CardTitle>
            <Badge
              variant={
                item.trend === 'up'
                  ? 'default'
                  : item.trend === 'down'
                    ? 'destructive'
                    : 'secondary'
              }
            >
              {item.change}
            </Badge>
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl text-foreground">{item.value}</div>
            <p className="mt-1 text-xs text-muted-foreground">Category: {item.category}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
