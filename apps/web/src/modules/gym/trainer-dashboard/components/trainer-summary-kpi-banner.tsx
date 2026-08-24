import React from 'react';
import { Card, CardContent, Button, Badge } from '@kinergy-platform/ui';
import { TrainerDashboardSummaryVM } from '../types';

interface TrainerSummaryKpiBannerProps {
  summary?: TrainerDashboardSummaryVM;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

export const TrainerSummaryKpiBanner: React.FC<TrainerSummaryKpiBannerProps> = ({
  summary,
  isLoading,
  isError,
  onRetry,
}) => {
  if (isError) {
    return (
      <div
        role="alert"
        aria-live="assertive"
        className="flex items-center justify-between p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl"
        data-testid="kpi-banner-error"
      >
        <div className="flex items-center space-x-3">
          <span className="text-red-500 font-bold text-lg">⚠️</span>
          <div>
            <p className="text-sm font-semibold text-red-800 dark:text-red-200">
              Unable to load operational summary metrics.
            </p>
            <p className="text-xs text-red-600 dark:text-red-400">
              Other dashboard sections remain fully accessible.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry Summary
        </Button>
      </div>
    );
  }

  const kpis = [
    {
      id: 'kpi-total-clients',
      label: 'Assigned Clients',
      value: summary?.totalAssignedClients ?? 0,
      icon: '👥',
      badge: 'Active Roster',
      badgeVariant: 'secondary' as const,
      color: 'text-indigo-600 dark:text-indigo-400',
    },
    {
      id: 'kpi-active-memberships',
      label: 'Active Passes',
      value: summary?.activeMembershipsCount ?? 0,
      icon: '✅',
      badge: 'Good Standing',
      badgeVariant: 'default' as const,
      color: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      id: 'kpi-expiring-soon',
      label: `Expiring Soon (≤${summary?.horizonDays ?? 7}d)`,
      value: summary?.expiringSoonMembershipsCount ?? 0,
      icon: '⏳',
      badge: 'Urgent Action',
      badgeVariant:
        (summary?.expiringSoonMembershipsCount ?? 0) > 0
          ? ('destructive' as const)
          : ('secondary' as const),
      color: 'text-amber-600 dark:text-amber-400',
    },
    {
      id: 'kpi-frozen-memberships',
      label: 'Frozen Memberships',
      value: summary?.frozenMembershipsCount ?? 0,
      icon: '❄️',
      badge: 'Paused',
      badgeVariant: 'outline' as const,
      color: 'text-sky-600 dark:text-sky-400',
    },
    {
      id: 'kpi-today-checkins',
      label: "Today's Client Visits",
      value: summary?.todayGrantedCheckInsCount ?? 0,
      icon: '🚪',
      badge: 'Live Attendance',
      badgeVariant: 'default' as const,
      color: 'text-violet-600 dark:text-violet-400',
    },
  ];

  return (
    <div
      className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4"
      aria-label="Trainer Operational KPIs"
      data-testid="kpi-banner-container"
    >
      {kpis.map((kpi) => (
        <Card
          key={kpi.id}
          className="border border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 shadow-sm backdrop-blur transition-all duration-200 hover:shadow-md"
        >
          <CardContent className="p-4 flex flex-col justify-between h-full">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xl select-none" aria-hidden="true">
                {kpi.icon}
              </span>
              <Badge variant={kpi.badgeVariant} size="sm">
                {kpi.badge}
              </Badge>
            </div>
            <div>
              {isLoading ? (
                <div className="h-8 w-16 bg-slate-200 dark:bg-slate-800 animate-pulse rounded my-1" />
              ) : (
                <div className={`text-2xl sm:text-3xl font-extrabold tracking-tight ${kpi.color}`}>
                  {kpi.value}
                </div>
              )}
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1 truncate">
                {kpi.label}
              </p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
