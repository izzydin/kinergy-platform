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
// API Base URL
// ─────────────────────────────────────────────────────────────────────────────

const BASE_URL = '/api/v1/dashboard';

/**
 * Shared fetch wrapper that throws a structured error on non-OK responses.
 * In production this would be replaced by the shared HttpClient (ADR-FE-0017).
 */
async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const err = new Error(
      (body as { message?: string }).message ?? `HTTP ${response.status} — ${url}`,
    ) as Error & { statusCode: number };
    err.statusCode = response.status;
    throw err;
  }

  return response.json() as Promise<T>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure Fetch Functions (transport layer)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches the dashboard metrics collection.
 * MSW handler: GET /api/v1/dashboard/metrics
 */
export async function fetchDashboardMetrics(): Promise<readonly DashboardMetricItem[]> {
  const raw = await apiFetch<unknown>(`${BASE_URL}/metrics`);
  const parsed = metricsResponseSchema.parse(raw);
  return parsed.items;
}

/**
 * Fetches the system operational status summary.
 * MSW handler: GET /api/v1/dashboard/status
 */
export async function fetchDashboardStatus(): Promise<DashboardStatusSummary> {
  const raw = await apiFetch<unknown>(`${BASE_URL}/status`);
  return statusResponseSchema.parse(raw);
}

/**
 * Fetches the recent activity feed.
 * MSW handler: GET /api/v1/dashboard/activities
 */
export async function fetchDashboardActivities(): Promise<readonly DashboardActivity[]> {
  const raw = await apiFetch<unknown>(`${BASE_URL}/activities`);
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
  const raw = await apiFetch<unknown>(`${BASE_URL}/activities/${id}/bookmark`, {
    method: 'POST',
    body: JSON.stringify({ bookmarked }),
  });
  return bookmarkResponseSchema.parse(raw);
}
