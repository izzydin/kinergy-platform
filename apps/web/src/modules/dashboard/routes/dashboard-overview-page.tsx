import React from 'react';
import { Badge } from '@kinergy-platform/ui';
import { Clock } from 'lucide-react';
import { SlotInject } from '../../../shared/ui/slots/SlotInject';
import {
  useDashboardAccess,
  getTodayOperationalBusinessDay,
  OPERATIONAL_FACILITY_TIMEZONE,
} from '../api/operational-dashboard-queries';
import { DashboardMetricsSection } from '../components/dashboard-metrics-section';
import { DashboardTodaysSchedule } from '../components/dashboard-todays-schedule';
import { DashboardNeedsAttention } from '../components/dashboard-needs-attention';
import { DashboardQuickActions } from '../components/dashboard-quick-actions';

/**
 * Kinergy Main Operational Business Dashboard (/dashboard)
 *
 * Provides daily operational visibility across gym attendance, inventory alerts,
 * clinic/training appointments, and settled revenue, alongside role-aware
 * Today's Schedule, Needs Attention alerts, and Quick Actions.
 */
export const DashboardOverviewPage: React.FC = () => {
  const { roleLabel, canViewAppointments } = useDashboardAccess();
  const businessDay = getTodayOperationalBusinessDay();

  return (
    <div className="space-y-6 pb-8" data-testid="operational-dashboard-page">
      {/* Inject compact quick actions into the layout header slot when mounted inside DashboardLayout */}
      <SlotInject target="header-actions">
        <DashboardQuickActions variant="compact" />
      </SlotInject>

      {/* 1. Operational Context Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Dashboard Overview
            </h1>
            <Badge
              variant="secondary"
              className="text-xs font-medium"
              data-testid="dashboard-role-badge"
            >
              {roleLabel}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5 flex-wrap">
            <span>Daily facility operations, schedule, and actionable alerts</span>
            <span aria-hidden="true">·</span>
            <span
              className="inline-flex items-center gap-1 font-medium text-foreground/80"
              data-testid="dashboard-business-day-label"
            >
              <Clock className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
              <span>
                {businessDay.displayLabel} ({OPERATIONAL_FACILITY_TIMEZONE})
              </span>
            </span>
          </p>
        </div>
      </div>

      {/* 2. Key Operational Business Indicators (KPI Cards) */}
      <DashboardMetricsSection />

      {/* 3. Primary Operational Workspace Grid */}
      {canViewAppointments ? (
        <div className="grid gap-6 grid-cols-1 lg:grid-cols-12 items-start">
          <div className="lg:col-span-7">
            <DashboardTodaysSchedule />
          </div>
          <div className="lg:col-span-5 space-y-6">
            <DashboardNeedsAttention />
            <DashboardQuickActions variant="panel" />
          </div>
        </div>
      ) : (
        <div className="grid gap-6 grid-cols-1 lg:grid-cols-12 items-start">
          <div className="lg:col-span-7">
            <DashboardNeedsAttention />
          </div>
          <div className="lg:col-span-5">
            <DashboardQuickActions variant="panel" />
          </div>
        </div>
      )}
    </div>
  );
};
