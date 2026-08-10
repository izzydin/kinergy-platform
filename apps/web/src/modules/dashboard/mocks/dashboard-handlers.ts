import { delay, http, HttpResponse, type RequestHandler } from 'msw';
import type { DashboardActivity, DashboardMetricItem, DashboardStatusSummary } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Mock Data
// ─────────────────────────────────────────────────────────────────────────────

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
  lastUpdated: new Date().toISOString(),
};

let MOCK_ACTIVITIES: DashboardActivity[] = [
  {
    id: 'act-1',
    title: 'Security audit completed for Tenant #42',
    timestamp: new Date(Date.now() - 5 * 60_000).toISOString(),
    type: 'success',
    bookmarked: false,
  },
  {
    id: 'act-2',
    title: 'Energy meter telemetry batch ingested (10k items)',
    timestamp: new Date(Date.now() - 12 * 60_000).toISOString(),
    type: 'info',
    bookmarked: false,
  },
  {
    id: 'act-3',
    title: 'High memory consumption spike detected on API node 2',
    timestamp: new Date(Date.now() - 34 * 60_000).toISOString(),
    type: 'warning',
    bookmarked: true,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Retry counter — used to validate TanStack Query retry behavior in tests.
// Handler for metrics will fail `retryFailCount` times before succeeding.
// ─────────────────────────────────────────────────────────────────────────────
let metricsRetryFailCount = 0;

/** Dev/test only: prime the metrics handler to fail N times before succeeding */
export function __setMetricsRetryFailCount(n: number): void {
  metricsRetryFailCount = n;
}

/** Dev/test only: reset mutable mock state (call in afterEach) */
export function __resetDashboardMockState(): void {
  metricsRetryFailCount = 0;
  MOCK_ACTIVITIES = [
    {
      id: 'act-1',
      title: 'Security audit completed for Tenant #42',
      timestamp: new Date(Date.now() - 5 * 60_000).toISOString(),
      type: 'success',
      bookmarked: false,
    },
    {
      id: 'act-2',
      title: 'Energy meter telemetry batch ingested (10k items)',
      timestamp: new Date(Date.now() - 12 * 60_000).toISOString(),
      type: 'info',
      bookmarked: false,
    },
    {
      id: 'act-3',
      title: 'High memory consumption spike detected on API node 2',
      timestamp: new Date(Date.now() - 34 * 60_000).toISOString(),
      type: 'warning',
      bookmarked: true,
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// MSW Request Handlers
//
// Simulation state is driven by the X-Sim-State header (set by useDashboardMetrics
// simulation hooks in dev panel) or by handler overrides in tests.
// ─────────────────────────────────────────────────────────────────────────────

export const dashboardHandlers: RequestHandler[] = [
  http.get('*/api/v1/dashboard/metrics', async ({ request }) => {
    await delay(200);

    const simState = request.headers.get('X-Sim-State');

    if (simState === 'error') {
      return HttpResponse.json(
        { message: 'Failed to load dashboard metrics from remote API gateway.' },
        { status: 500 },
      );
    }

    if (simState === 'empty') {
      return HttpResponse.json({ items: [] });
    }

    // Retry simulation: decrement counter and return 503 until exhausted
    if (metricsRetryFailCount > 0) {
      metricsRetryFailCount--;
      return HttpResponse.json(
        { message: 'Service temporarily unavailable. Retry later.' },
        { status: 503 },
      );
    }

    return HttpResponse.json({ items: MOCK_METRICS });
  }),

  http.get('*/api/v1/dashboard/status', async ({ request }) => {
    await delay(150);

    const simState = request.headers.get('X-Sim-State');

    if (simState === 'error') {
      return HttpResponse.json({ message: 'System health service unavailable.' }, { status: 500 });
    }

    return HttpResponse.json({
      ...MOCK_STATUS,
      lastUpdated: new Date().toISOString(),
    });
  }),

  http.get('*/api/v1/dashboard/activities', async ({ request }) => {
    await delay(180);

    const simState = request.headers.get('X-Sim-State');

    if (simState === 'error') {
      return HttpResponse.json(
        { message: 'Activity logging service returned HTTP 500.' },
        { status: 500 },
      );
    }

    if (simState === 'empty') {
      return HttpResponse.json({ items: [] });
    }

    return HttpResponse.json({ items: MOCK_ACTIVITIES });
  }),

  http.post('*/api/v1/dashboard/activities/:id/bookmark', async ({ request, params }) => {
    await delay(100);

    const id = params['id'] as string;
    const body = (await request.json()) as { bookmarked?: boolean };

    const activityIndex = MOCK_ACTIVITIES.findIndex((a) => a.id === id);

    if (activityIndex === -1) {
      return HttpResponse.json({ message: `Activity '${id}' not found.` }, { status: 404 });
    }

    const newBookmarked = body.bookmarked ?? !MOCK_ACTIVITIES[activityIndex]!.bookmarked;
    MOCK_ACTIVITIES[activityIndex] = {
      ...MOCK_ACTIVITIES[activityIndex]!,
      bookmarked: newBookmarked,
    };

    return HttpResponse.json({ id, bookmarked: newBookmarked });
  }),
];
