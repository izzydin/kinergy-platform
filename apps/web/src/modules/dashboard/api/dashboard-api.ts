import { z } from 'zod';
import type { DashboardActivity, DashboardMetricItem, DashboardStatusSummary } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Zod Boundary Schemas (ADR-FE-0019)
//
// Raw API response payloads are validated at the transport edge before being
// consumed by query hooks. Schema mismatch at this boundary throws ZodError,
// preventing corrupted data from reaching component state.
// ─────────────────────────────────────────────────────────────────────────────

const metricItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  value: z.string(),
  change: z.string(),
  trend: z.enum(['up', 'down', 'neutral']),
  category: z.string(),
});

const metricsResponseSchema = z.object({
  items: z.array(metricItemSchema),
});

const statusResponseSchema = z.object({
  systemStatus: z.enum(['operational', 'degraded', 'maintenance']),
  activeServices: z.number(),
  totalServices: z.number(),
  lastUpdated: z.string(),
});

const activityItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  timestamp: z.string(),
  type: z.enum(['info', 'warning', 'error', 'success']),
  bookmarked: z.boolean(),
});

const activitiesResponseSchema = z.object({
  items: z.array(activityItemSchema),
});

const bookmarkResponseSchema = z.object({
  id: z.string(),
  bookmarked: z.boolean(),
});

// ─────────────────────────────────────────────────────────────────────────────
import { httpClient } from '../../../shared/api';

// ─────────────────────────────────────────────────────────────────────────────
// API Endpoint Path Constants
// ─────────────────────────────────────────────────────────────────────────────

const ENDPOINTS = {
  metrics: '/dashboard/metrics',
  status: '/dashboard/status',
  activities: '/dashboard/activities',
  bookmark: (id: string) => `/dashboard/activities/${id}/bookmark`,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Pure Fetch Functions (transport layer)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches the dashboard metrics collection.
 * MSW handler: GET /api/v1/dashboard/metrics
 */
export async function fetchDashboardMetrics(): Promise<readonly DashboardMetricItem[]> {
  const raw = await httpClient.get<unknown>(ENDPOINTS.metrics);
  const parsed = metricsResponseSchema.parse(raw);
  return parsed.items;
}

/**
 * Fetches the system operational status summary.
 * MSW handler: GET /api/v1/dashboard/status
 */
export async function fetchDashboardStatus(): Promise<DashboardStatusSummary> {
  const raw = await httpClient.get<unknown>(ENDPOINTS.status);
  return statusResponseSchema.parse(raw);
}

/**
 * Fetches the recent activity feed.
 * MSW handler: GET /api/v1/dashboard/activities
 */
export async function fetchDashboardActivities(): Promise<readonly DashboardActivity[]> {
  const raw = await httpClient.get<unknown>(ENDPOINTS.activities);
  const parsed = activitiesResponseSchema.parse(raw);
  return parsed.items;
}

/**
 * Toggles bookmark status for a specific activity.
 * MSW handler: POST /api/v1/dashboard/activities/:id/bookmark
 */
export async function toggleActivityBookmark(
  id: string,
  bookmarked: boolean,
): Promise<{ id: string; bookmarked: boolean }> {
  const raw = await httpClient.post<unknown>(ENDPOINTS.bookmark(id), { bookmarked });
  return bookmarkResponseSchema.parse(raw);
}
