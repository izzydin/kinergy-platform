import { useQuery } from '@tanstack/react-query';
import type { DashboardMetricItem, DashboardStatusSummary } from '../types';

/**
 * Centralized Query Key Factory for Dashboard Feature Module
 */
export const dashboardQueryKeys = {
  all: ['dashboard'] as const,
  metrics: (state: string) => [...dashboardQueryKeys.all, 'metrics', state] as const,
  status: (state: string) => [...dashboardQueryKeys.all, 'status', state] as const,
  activities: (state: string) => [...dashboardQueryKeys.all, 'activities', state] as const,
};

export interface DashboardActivityItem {
  readonly id: string;
  readonly title: string;
  readonly timestamp: string;
  readonly type: 'info' | 'warning' | 'error' | 'success';
}

// Mock Data Generators for 4-State UI Validation
const MOCK_METRICS: readonly DashboardMetricItem[] = [
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

const MOCK_STATUS: DashboardStatusSummary = {
  systemStatus: 'operational',
  activeServices: 18,
  totalServices: 18,
  lastUpdated: 'Just now',
};

const MOCK_ACTIVITIES: readonly DashboardActivityItem[] = [
  {
    id: 'act-1',
    title: 'Security audit completed for Tenant #42',
    timestamp: '5 mins ago',
    type: 'success',
  },
  {
    id: 'act-2',
    title: 'Energy meter telemetry batch ingested (10k items)',
    timestamp: '12 mins ago',
    type: 'info',
  },
  {
    id: 'act-3',
    title: 'High memory consumption spike detected on API node 2',
    timestamp: '34 mins ago',
    type: 'warning',
  },
];

/**
 * Custom Query Hook fetching Dashboard Metrics supporting 4-State UI
 */
export function useDashboardMetrics(simulationState: 'success' | 'loading' | 'empty' | 'error') {
  return useQuery<readonly DashboardMetricItem[], Error>({
    queryKey: dashboardQueryKeys.metrics(simulationState),
    queryFn: async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      if (simulationState === 'error') {
        throw new Error('Failed to load dashboard metrics from remote API gateway.');
      }
      if (simulationState === 'empty') {
        return [];
      }
      return MOCK_METRICS;
    },
    enabled: simulationState !== 'loading',
    retry: false,
  });
}

/**
 * Custom Query Hook fetching Dashboard Status Summary
 */
export function useDashboardStatus(simulationState: 'success' | 'loading' | 'empty' | 'error') {
  return useQuery<DashboardStatusSummary, Error>({
    queryKey: dashboardQueryKeys.status(simulationState),
    queryFn: async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      if (simulationState === 'error') {
        throw new Error('System health service unavailable.');
      }
      return MOCK_STATUS;
    },
    enabled: simulationState !== 'loading',
    retry: false,
  });
}

/**
 * Custom Query Hook fetching Recent Activity Feed supporting 4-State UI
 */
export function useDashboardActivities(simulationState: 'success' | 'loading' | 'empty' | 'error') {
  return useQuery<readonly DashboardActivityItem[], Error>({
    queryKey: dashboardQueryKeys.activities(simulationState),
    queryFn: async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      if (simulationState === 'error') {
        throw new Error('Activity logging service returned HTTP 500.');
      }
      if (simulationState === 'empty') {
        return [];
      }
      return MOCK_ACTIVITIES;
    },
    enabled: simulationState !== 'loading',
    retry: false,
  });
}
