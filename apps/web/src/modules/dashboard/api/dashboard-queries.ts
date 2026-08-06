import { useQuery } from '@tanstack/react-query';
import {
  fetchDashboardActivities,
  fetchDashboardMetrics,
  fetchDashboardStatus,
} from './dashboard-api';
import { dashboardKeys } from './dashboard-query-keys';
import type { DashboardActivity, DashboardMetricItem, DashboardStatusSummary } from '../types';

// Re-export for backward-compat with components that still import from this file
export { dashboardKeys };

/**
 * @deprecated Import DashboardActivityItem from ../types as DashboardActivity.
 * Kept temporarily for components created in A5.2 that reference DashboardActivityItem.
 */
export type DashboardActivityItem = DashboardActivity;

// ─────────────────────────────────────────────────────────────────────────────
// Simulation State
//
// SimulationState drives the Dashboard dev panel (A5.2) 4-State UI validation.
//
// Architecture decision: the simulated hooks use in-memory data rather than
// real network requests. This ensures:
//  1. Tests work deterministically without MSW setup.
//  2. The dev panel works even before MSW initializes on first load.
//  3. Real data flow is exercised by the non-simulated hooks (useDashboardMetricsQuery)
//     which call the actual API layer (dashboard-api.ts → MSW in dev, real API in prod).
// ─────────────────────────────────────────────────────────────────────────────

export type SimulationState = 'success' | 'loading' | 'empty' | 'error';

// ─── In-memory mock data for simulated hooks ──────────────────────────────────

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

const MOCK_ACTIVITIES: readonly DashboardActivity[] = [
  {
    id: 'act-1',
    title: 'Security audit completed for Tenant #42',
    timestamp: '5 mins ago',
    type: 'success',
    bookmarked: false,
  },
  {
    id: 'act-2',
    title: 'Energy meter telemetry batch ingested (10k items)',
    timestamp: '12 mins ago',
    type: 'info',
    bookmarked: false,
  },
  {
    id: 'act-3',
    title: 'High memory consumption spike detected on API node 2',
    timestamp: '34 mins ago',
    type: 'warning',
    bookmarked: true,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Simulated Query Hooks (used by Dashboard dev panel A5.2)
//
// These hooks use in-memory data and simulate async behavior with a short delay.
// They never fire real network requests, so they work in all environments
// (tests, Storybook, dev panel, CI). The MSW layer validates the real API flow.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * useDashboardMetrics — Simulation hook for 4-State UI dev panel.
 *
 * Uses in-memory data. Real network flow is validated by useDashboardMetricsQuery.
 */
export function useDashboardMetrics(simulationState: SimulationState) {
  return useQuery<readonly DashboardMetricItem[], Error>({
    queryKey: [...dashboardKeys.metrics(), 'sim', simulationState],
    queryFn: async () => {
      // Short delay to simulate realistic async latency
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
    staleTime: 1000 * 60 * 2,
  });
}

/**
 * useDashboardStatus — Simulation hook for 4-State UI dev panel.
 */
export function useDashboardStatus(simulationState: SimulationState) {
  return useQuery<DashboardStatusSummary, Error>({
    queryKey: [...dashboardKeys.status(), 'sim', simulationState],
    queryFn: async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));

      if (simulationState === 'error') {
        throw new Error('System health service unavailable.');
      }
      return MOCK_STATUS;
    },
    enabled: simulationState !== 'loading',
    retry: false,
    staleTime: 1000 * 60,
  });
}

/**
 * useDashboardActivities — Simulation hook for 4-State UI dev panel.
 */
export function useDashboardActivities(simulationState: SimulationState) {
  return useQuery<readonly DashboardActivity[], Error>({
    queryKey: [...dashboardKeys.activities(), 'sim', simulationState],
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
    staleTime: 1000 * 30,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Real API Hooks (non-simulated — call the actual transport layer)
//
// These hooks call dashboard-api.ts which fires real fetch requests.
// In development, MSW intercepts them. In production, they hit the real backend.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * useDashboardMetricsQuery — Fetches live metrics from /api/v1/dashboard/metrics.
 * Used by integration tests (mock-backend-transport.spec) and future production pages.
 */
export function useDashboardMetricsQuery() {
  return useQuery<readonly DashboardMetricItem[], Error>({
    queryKey: dashboardKeys.metrics(),
    queryFn: fetchDashboardMetrics,
    staleTime: 1000 * 60 * 2,
  });
}

/**
 * useDashboardStatusQuery — Fetches live system status from /api/v1/dashboard/status.
 */
export function useDashboardStatusQuery() {
  return useQuery<DashboardStatusSummary, Error>({
    queryKey: dashboardKeys.status(),
    queryFn: fetchDashboardStatus,
    staleTime: 1000 * 60,
  });
}

/**
 * useDashboardActivitiesQuery — Fetches live activity feed from /api/v1/dashboard/activities.
 */
export function useDashboardActivitiesQuery() {
  return useQuery<readonly DashboardActivity[], Error>({
    queryKey: dashboardKeys.activities(),
    queryFn: fetchDashboardActivities,
    staleTime: 1000 * 30,
  });
}
