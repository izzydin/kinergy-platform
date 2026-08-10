import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kinergy-platform/ui';
import { SlotInject } from '../../../shared/ui/slots';
import { DashboardActivitySection } from '../components/dashboard-activity-section';
import { DashboardMetricsSection } from '../components/dashboard-metrics-section';
import { DashboardQuickActions } from '../components/dashboard-quick-actions';
import { DashboardSystemHealthSection } from '../components/dashboard-system-health-section';

export const DashboardOverviewPage: React.FC = () => {
  const [simulationState, setSimulationState] = useState<'success' | 'loading' | 'empty' | 'error'>(
    'success',
  );

  return (
    <div className="space-y-6">
      {/* 1. Declarative Header Action Slot Injection */}
      <SlotInject target="header-actions">
        <div className="flex items-center gap-2">
          <DashboardQuickActions />
          <Button asChild variant="outline" size="sm">
            <Link to="/dashboard/metrics">Metrics Detail</Link>
          </Button>
          <Button asChild variant="default" size="sm">
            <Link to="/dashboard/ui-states">UI States & A6 Showcase</Link>
          </Button>
        </div>
      </SlotInject>

      {/* 2. Header & Title Block */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-bold text-3xl tracking-tight text-foreground">
              Dashboard Overview
            </h1>
            <Badge variant="outline" className="hidden sm:inline-flex">
              Step A5.2 Validation
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm">
            Architectural validation screen verifying layout, header, breadcrumbs, slot injection,
            cards, buttons, badges, skeletons, spinner, toasts, theme tokens, and 4-State UI.
          </p>
        </div>
      </div>

      {/* 3. Interactive 4-State UI Control Panel */}
      <Card className="border-primary/20 bg-muted/20">
        <CardHeader className="pb-3">
          <CardTitle className="font-semibold text-base text-foreground">
            4-State UI Simulation Controller
          </CardTitle>
          <CardDescription>
            Toggle state below to validate Loading, Empty, Error, and Success behaviors across all
            asynchronous dashboard sections.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Button
            variant={simulationState === 'success' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSimulationState('success')}
          >
            State: Success
          </Button>
          <Button
            variant={simulationState === 'loading' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSimulationState('loading')}
          >
            State: Loading
          </Button>
          <Button
            variant={simulationState === 'empty' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSimulationState('empty')}
          >
            State: Empty
          </Button>
          <Button
            variant={simulationState === 'error' ? 'destructive' : 'outline'}
            size="sm"
            onClick={() => setSimulationState('error')}
          >
            State: Error
          </Button>
        </CardContent>
      </Card>

      {/* 4. Asynchronous Metrics Section (4-State Contract) */}
      <DashboardMetricsSection
        simulationState={simulationState}
        onRetry={() => setSimulationState('success')}
      />

      {/* 5. System Health & Toast Notification Verification Section */}
      <DashboardSystemHealthSection simulationState={simulationState} />

      {/* 6. Asynchronous Activity Feed Section (4-State Contract) */}
      <DashboardActivitySection
        simulationState={simulationState}
        onRetry={() => setSimulationState('success')}
      />
    </div>
  );
};
