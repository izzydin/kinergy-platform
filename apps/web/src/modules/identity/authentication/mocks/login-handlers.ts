import { http, HttpResponse, type RequestHandler } from 'msw';
import { DEFAULT_DEV_USER } from '../../../auth/domain/auth-state.types';
import type { CurrentUser, LoginResponse } from '../domain/login.types';

export const MOCK_CURRENT_USER: CurrentUser = {
  id: DEFAULT_DEV_USER.id,
  email: DEFAULT_DEV_USER.email,
  name: DEFAULT_DEV_USER.name,
  roles: DEFAULT_DEV_USER.roles,
  permissions: DEFAULT_DEV_USER.permissions,
  tenantId: DEFAULT_DEV_USER.tenantId,
};

/**
 * Mock Service Worker (MSW) Handlers for Identity Authentication
 *
 * Intercepts POST /api/v1/auth/login network requests at the browser / test layer.
 * Mirrors NestJS AuthenticationResponse contracts and supports simulation testing via X-Sim-State headers.
 */
export const loginHandlers: RequestHandler[] = [
  http.post('*/api/v1/auth/login', async ({ request }) => {
    const simState = request.headers.get('X-Sim-State');

    // 1. Simulation triggers for automated testing
    if (simState === 'invalid-credentials') {
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

    if (simState === 'inactive-user') {
      return HttpResponse.json(
        {
          statusCode: 401,
          error: 'Unauthorized',
          message: 'User account is inactive or blocked.',
          timestamp: new Date().toISOString(),
          path: '/api/v1/auth/login',
        },
        { status: 401 },
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

    if (simState === 'server-failure') {
      return HttpResponse.json(
        {
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'Authentication gateway service failure',
          timestamp: new Date().toISOString(),
          path: '/api/v1/auth/login',
        },
        { status: 500 },
      );
    }

    if (simState === 'network-failure') {
      return HttpResponse.error();
    }

    let body: Record<string, unknown> = {};
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      // Empty body
    }

    // 2. Request body validation triggers
    if (typeof body.email === 'string' && body.email.includes('invalid-email')) {
      return HttpResponse.json(
        {
          statusCode: 400,
          error: 'Bad Request',
          message: ['email must be a valid email address'],
          timestamp: new Date().toISOString(),
          path: '/api/v1/auth/login',
        },
        { status: 400 },
      );
    }

    if (
      body.email === 'blocked@kinergy.io' ||
      body.email === 'inactive@kinergy.io' ||
      body.email === 'disabled@kinergy.io'
    ) {
      return HttpResponse.json(
        {
          statusCode: 401,
          error: 'Unauthorized',
          message: 'User account is inactive or blocked.',
          timestamp: new Date().toISOString(),
          path: '/api/v1/auth/login',
        },
        { status: 401 },
      );
    }

    if (
      body.email === 'invalid@kinergy.io' ||
      body.password === 'wrong-password' ||
      body.password === 'invalid'
    ) {
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

    // 3. Successful Authentication Response
    const responsePayload: LoginResponse = {
      accessToken: 'mock-jwt-access-token-login-12345',
      tokenType: 'Bearer',
      expiresIn: 900,
      user: {
        id: MOCK_CURRENT_USER.id,
        email: typeof body.email === 'string' ? body.email : MOCK_CURRENT_USER.email,
        name: MOCK_CURRENT_USER.name,
        roles: MOCK_CURRENT_USER.roles,
        permissions: MOCK_CURRENT_USER.permissions,
        tenantId: MOCK_CURRENT_USER.tenantId,
      },
    };

    return HttpResponse.json(responsePayload, {
      status: 200,
      headers: {
        'Set-Cookie':
          'refreshToken=mock-refresh-token-xyz; Path=/; HttpOnly; Secure; SameSite=Strict',
      },
    });
  }),
];
