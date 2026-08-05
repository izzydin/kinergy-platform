import React, { useState } from 'react';
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
import { DashboardQuickActions } from '../components/dashboard-quick-actions';
import { DashboardSummaryCards } from '../components/dashboard-summary-cards';
import type { DashboardMetricItem, DashboardStatusSummary } from '../types';

const INITIAL_METRICS: readonly DashboardMetricItem[] = [
  {
    id: 'm-1',
    title: 'Active Energy Monitors',
    value: '1,420',
    change: '+12%',
    trend: 'up',
    category: 'Telemetry',
  },
  {
    id: 'm-2',
    title: 'System Throughput',
    value: '99.98%',
    change: 'Stable',
    trend: 'neutral',
    category: 'Infrastructure',
  },
  {
    id: 'm-3',
    title: 'Pending Audit Tasks',
    value: '3',
    change: '-25%',
    trend: 'down',
    category: 'Compliance',
  },
  {
    id: 'm-4',
    title: 'Active Tenant Sessions',
    value: '348',
    change: '+8%',
    trend: 'up',
    category: 'Identity',
  },
];

const INITIAL_STATUS: DashboardStatusSummary = {
  systemStatus: 'operational',
  activeServices: 18,
  totalServices: 18,
  lastUpdated: new Date().toLocaleTimeString(),
};

export const DashboardOverviewPage: React.FC = () => {
  const [metrics] = useState<readonly DashboardMetricItem[]>(INITIAL_METRICS);
  const [status] = useState<DashboardStatusSummary>(INITIAL_STATUS);

  return (
    <div className="space-y-6 p-6">
      {/* Declarative Slot Injection into Shell Header Actions */}
      <SlotInject target="header-actions">
        <div className="flex items-center gap-2">
          <DashboardQuickActions />
          <Button asChild variant="outline" size="sm">
            <Link to="/dashboard/metrics">View Detailed Metrics</Link>
          </Button>
        </div>
      </SlotInject>

      <div>
        <h1 className="font-bold text-3xl tracking-tight text-foreground">Dashboard Overview</h1>
        <p className="text-muted-foreground text-sm">
          Architectural validation module verifying layout slot injections, routing, and design
          system contracts.
        </p>
      </div>

      <DashboardSummaryCards metrics={metrics} status={status} />

      <Card>
        <CardHeader>
          <CardTitle>Architecture Validation Specifications</CardTitle>
          <CardDescription>
            Verified module boundaries, route registration, and slot injection capabilities.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-foreground font-medium">
            ✓ Module Decoupling: Zero direct imports of internal feature components.
          </p>
          <p className="text-foreground font-medium">
            ✓ Layout Slot Injection: Declares header action slot injections from local state.
          </p>
          <p className="text-foreground font-medium">
            ✓ Design System Contracts: Exclusively consumes @kinergy-platform/ui presentational
            primitives.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
