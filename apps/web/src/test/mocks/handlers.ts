import { http, HttpResponse, type RequestHandler } from 'msw';
import { dashboardHandlers } from '../../modules/dashboard/mocks/dashboard-handlers';
import { settingsHandlers } from '../../modules/settings/mocks/settings-handlers';

/**
 * Platform Infrastructure Mock Handlers
 *
 * Provides base infrastructure ping endpoints and handler registration interfaces
 * for future domain feature modules without containing business mock data.
 */
export const infrastructureHandlers: RequestHandler[] = [
  // Platform Health & Infrastructure Verification Endpoint
  http.get('/api/v1/health', () => {
    return HttpResponse.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: '@kinergy-platform/web',
    });
  }),
];

/**
 * Domain Feature Module Handlers
 *
 * Each feature module registers its own MSW handlers in its `mocks/` directory.
 * They are imported here once and composed into the final handler array.
 * When future modules (Clients, Scheduling, Sales) are added, only this file
 * changes — no test setup or browser worker configuration requires modification.
 */
const featureHandlers: RequestHandler[] = [...dashboardHandlers, ...settingsHandlers];

const dynamicHandlers: RequestHandler[] = [];

/**
 * Complete Handler Registry
 *
 * Combines baseline infrastructure handlers with all feature module handlers.
 * Used by both the browser Service Worker (init-msw.ts) and the Vitest Node
 * server (server.ts) to provide a unified mock API surface.
 */
export const handlers: RequestHandler[] = [...infrastructureHandlers, ...featureHandlers];

/**
 * Allows additional feature modules to register mock handlers dynamically at
 * runtime (e.g., lazily loaded modules or Storybook stories).
 */
export function registerHandlers(...newHandlers: RequestHandler[]): void {
  dynamicHandlers.push(...newHandlers);
  handlers.push(...newHandlers);
}
