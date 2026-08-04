import { http, HttpResponse, RequestHandler } from 'msw';

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

const dynamicHandlers: RequestHandler[] = [];

/**
 * Public Handler Registry
 *
 * Combines baseline infrastructure handlers with dynamic feature module handlers registered at runtime.
 */
export const handlers: RequestHandler[] = [...infrastructureHandlers];

/**
 * Allows future feature modules (src/modules/*) to register their mock handlers dynamically.
 */
export function registerHandlers(...newHandlers: RequestHandler[]): void {
  dynamicHandlers.push(...newHandlers);
  handlers.push(...newHandlers);
}
