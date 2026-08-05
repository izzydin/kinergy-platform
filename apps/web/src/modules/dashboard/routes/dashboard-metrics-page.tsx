import React from 'react';
import { Link } from 'react-router-dom';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kinergy-platform/ui';
import { SlotInject } from '../../../shared/ui/slots';

export const DashboardMetricsPage: React.FC = () => {
  return (
    <div className="space-y-6 p-6">
      <SlotInject target="header-actions">
        <Button asChild variant="outline" size="sm">
          <Link to="/dashboard">← Back to Overview</Link>
        </Button>
      </SlotInject>

      <div>
        <h1 className="font-bold text-3xl tracking-tight text-foreground">Metrics & Performance</h1>
        <p className="text-muted-foreground text-sm">
          Sub-route validation view for dashboard metrics (/dashboard/metrics).
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Telemetry Throughput</CardTitle>
            <CardDescription>Real-time metric telemetry streaming rates.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="font-semibold text-2xl">48.2k msg/sec</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Average Response Latency</CardTitle>
            <CardDescription>p99 latency metrics across API endpoints.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="font-semibold text-2xl">14.2 ms</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
