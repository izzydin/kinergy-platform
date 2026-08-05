import React from 'react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@kinergy-platform/ui';
import type { DashboardMetricItem, DashboardStatusSummary } from '../types';

interface DashboardSummaryCardsProps {
  readonly metrics: readonly DashboardMetricItem[];
  readonly status: DashboardStatusSummary;
}

export const DashboardSummaryCards: React.FC<DashboardSummaryCardsProps> = ({
  metrics,
  status,
}) => {
  return (
    <div className="space-y-6">
      {status.systemStatus !== 'operational' && (
        <Alert variant="warning">
          <AlertTitle>System Advisory</AlertTitle>
          <AlertDescription>
            Platform is currently in {status.systemStatus} mode. Active services:{' '}
            {status.activeServices}/{status.totalServices}.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
    </div>
  );
};
