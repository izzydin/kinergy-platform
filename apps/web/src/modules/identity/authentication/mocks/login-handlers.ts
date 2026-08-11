import { delay, http, HttpResponse, type RequestHandler } from 'msw';
import { DEFAULT_DEV_USER } from '../../../auth/domain/auth-state.types';

/**
 * Mock Service Worker (MSW) Handlers for Identity Authentication
 *
 * Intercepts POST /api/v1/auth/login network requests at the browser / test layer.
 * Mirrors backend OpenAPI contracts and supports simulation testing via X-Sim-State headers.
 */
export const loginHandlers: RequestHandler[] = [
  http.post('*/api/v1/auth/login', async ({ request }) => {
    await delay(100);

    const simState = request.headers.get('X-Sim-State');

    // Simulation triggers for automated integration tests
    if (simState === 'unauthorized') {
      return HttpResponse.json(
        {
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Invalid email or password.',
          timestamp: new Date().toISOString(),
          path: '/api/v1/auth/login',
        },
        { status: 401 },
      );
    }

    if (simState === 'rate-limited') {
      return HttpResponse.json(
        {
          statusCode: 429,
          error: 'Too Many Requests',
          message: 'ThrottlerException: Too Many Requests',
          timestamp: new Date().toISOString(),
          path: '/api/v1/auth/login',
        },
        { status: 429 },
      );
    }

    if (simState === 'validation-error') {
      return HttpResponse.json(
        {
          statusCode: 400,
          error: 'Bad Request',
          message: [
            'email must be a valid email address',
            'password must be at least 8 characters long',
          ],
          timestamp: new Date().toISOString(),
          path: '/api/v1/auth/login',
        },
        { status: 400 },
      );
    }

    if (simState === 'network-error') {
      return HttpResponse.json(
        {
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'Authentication gateway service unavailable',
          timestamp: new Date().toISOString(),
          path: '/api/v1/auth/login',
        },
        { status: 500 },
      );
    }

    let body: Record<string, unknown> = {};
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      // Empty body
    }

    // Default credential validation check in MSW
    if (body.email === 'invalid@kinergy.io' || body.password === 'wrong-password') {
      return HttpResponse.json(
        {
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Invalid email or password.',
          timestamp: new Date().toISOString(),
          path: '/api/v1/auth/login',
        },
        { status: 401 },
      );
    }

    // Return 200 OK with mock JWT token & HttpOnly refresh cookie
    return HttpResponse.json(
      {
        accessToken: 'mock-jwt-access-token-login-12345',
        expiresIn: 900,
        user: {
          id: DEFAULT_DEV_USER.id,
          email: typeof body.email === 'string' ? body.email : DEFAULT_DEV_USER.email,
          name: DEFAULT_DEV_USER.name,
          roles: DEFAULT_DEV_USER.roles,
          permissions: DEFAULT_DEV_USER.permissions,
          tenantId: DEFAULT_DEV_USER.tenantId,
        },
      },
      {
        headers: {
          'Set-Cookie':
            'refreshToken=mock-refresh-token-xyz; Path=/; HttpOnly; Secure; SameSite=Strict',
        },
      },
    );
  }),
];
