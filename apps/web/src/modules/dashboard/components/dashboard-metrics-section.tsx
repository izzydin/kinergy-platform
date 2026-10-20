import React from 'react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardHeader,
  Skeleton,
} from '@kinergy-platform/ui';
import {
  GymCheckInsCard,
  LowStockAlertsCard,
  TodayAppointmentsCard,
  DailySalesTotalCard,
} from './operational-metric-cards';

export interface DashboardMetricsSectionProps {
  readonly simulationState?: 'success' | 'loading' | 'empty' | 'error';
  readonly onRetry?: () => void;
}

export const DashboardMetricsSection: React.FC<DashboardMetricsSectionProps> = ({
  simulationState,
  onRetry,
}) => {
  // 1. SIMULATION LOADING STATE
  if (simulationState === 'loading') {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4" data-testid="metrics-loading">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={`skeleton-metric-${i}`}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-5 w-14 rounded-full" />
            </CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-3 w-36" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  // 2. SIMULATION ERROR STATE
  if (simulationState === 'error') {
    return (
      <Alert variant="destructive" data-testid="metrics-error">
        <AlertTitle>Metrics Data Error</AlertTitle>
        <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span>Failed to load dashboard metrics from remote API gateway.</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (onRetry) onRetry();
            }}
          >
            Retry Fetching
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  // 3. SIMULATION EMPTY STATE
  if (simulationState === 'empty') {
    return (
      <Alert variant="default" data-testid="metrics-empty">
        <AlertTitle>No Metrics Recorded</AlertTitle>
        <AlertDescription>
          No active telemetry monitors are registered for this workspace context.
        </AlertDescription>
      </Alert>
    );
  }

  // 4. OPERATIONAL / SUCCESS STATE (Live independent operational cards)
  const forcedState = simulationState === 'success' ? 'success' : undefined;

  return (
    <div
      className="grid gap-4 md:grid-cols-2 lg:grid-cols-4"
      data-testid="metrics-success"
      data-testid-grid="operational-metrics-grid"
    >
      <GymCheckInsCard onRetry={onRetry} forcedState={forcedState} />
      <LowStockAlertsCard onRetry={onRetry} forcedState={forcedState} />
      <TodayAppointmentsCard forcedState={forcedState} />
      <DailySalesTotalCard forcedState={forcedState} />
    </div>
  );
};
