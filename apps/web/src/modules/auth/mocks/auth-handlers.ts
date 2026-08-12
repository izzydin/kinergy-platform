import { delay, http, HttpResponse, type RequestHandler } from 'msw';
import { DEFAULT_DEV_USER } from '../domain/auth-state.types';

export const authHandlers: RequestHandler[] = [
  http.post('*/api/v1/auth/refresh', async ({ request }) => {
    await delay(100);

    const simState = request.headers.get('X-Sim-State');

    if (simState === 'unauthorized') {
      return HttpResponse.json(
        { message: 'Refresh token expired or revoked', statusCode: 401 },
        { status: 401 },
      );
    }

    if (simState === 'network-error') {
      return HttpResponse.json({ message: 'Authentication gateway unavailable' }, { status: 500 });
    }

    return HttpResponse.json({
      accessToken: 'mock-access-token-xyz',
      expiresIn: 900,
    });
  }),

  http.get('*/api/v1/auth/me', async ({ request }) => {
    await delay(100);

    const simState = request.headers.get('X-Sim-State');

    if (simState === 'unauthorized') {
      return HttpResponse.json(
        { message: 'Invalid or expired access token', statusCode: 401 },
        { status: 401 },
      );
    }

    return HttpResponse.json(DEFAULT_DEV_USER);
  }),

  http.post('*/api/v1/auth/logout', async ({ request }) => {
    await delay(50);
    const simState = request.headers.get('X-Sim-State');

    if (simState === 'server-failure' || simState === 'network-failure') {
      return HttpResponse.json(
        { message: 'Logout failed due to server error', statusCode: 500 },
        { status: 500 },
      );
    }

    return HttpResponse.json({ success: true });
  }),
];
