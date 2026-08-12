/**
 * Track B — Step B2.4: Authenticated API Client Integration Test Suite
 *
 * Integration test suite for Authenticated API Client (`HttpClient` + `AuthTransportManager`):
 *   1. Automatic Bearer token attachment for authenticated feature API calls
 *   2. Skip auth bypass flag (`skipAuth: true`)
 *   3. Expired access token (401) → silent refresh → transparent request retry
 *   4. Failed refresh handling → session clearance → AuthProvider UNAUTHENTICATED → ProtectedRoute redirect
 *   5. Refresh endpoint exclusion (/auth/refresh 401 does not trigger self-retry)
 *   6. Bounded retry limit (X-Retry-Attempt: 1 prevents infinite retry loops)
 *   7. Concurrent 401 requests single-flight deduplication (3 concurrent 401 calls → 1 refresh call)
 *   8. Non-authentication 4xx error behavior (400, 403, 404, 429 normalized to typed ApiErrors without refresh retries)
 *   9. 5xx Server Error behavior (500 normalized to ServerError without triggering refresh retries)
 */
import '@testing-library/jest-dom';
import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '../../../../app/providers/auth-provider';
import { ProtectedRoute } from '../../../auth/components/protected-route';
import { authTokenStore } from '../../../../shared/auth/auth-token-store';
import { setupAuthTransport } from '../../../../shared/auth/auth-transport';
import { httpClient } from '../../../../shared/api/http-client';
import {
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  RateLimitError,
  ServerError,
  ValidationError,
} from '../../../../shared/api/api-error';
import type { AuthUser } from '../../../auth/domain/auth-state.types';

const TEST_USER: AuthUser = {
  id: 'usr-b2-4-test',
  email: 'architect@kinergy.io',
  name: 'Lead Architect',
  roles: ['ADMIN'],
  permissions: ['client:read', 'energy:read'],
  tenantId: 'tenant_b2_4',
};

function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function createMockResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: new Headers({ 'Content-Type': 'application/json' }),
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as Response;
}

function extractUrl(url: unknown): string {
  if (typeof url === 'string') return url;
  if (url && typeof url === 'object' && 'url' in url) {
    return String((url as { url: unknown }).url);
  }
  return String(url);
}

const ProtectedPage: React.FC = () => {
  const { currentUser } = useAuth();
  return <div data-testid="protected-content">Protected Content: {currentUser?.name}</div>;
};

const LoginPage: React.FC = () => <div data-testid="login-page">Login Page</div>;

interface TestAppProps {
  queryClient?: QueryClient;
  initialEntries?: string[];
  initialSessionOverride?: AuthUser | null;
}

const TestApp: React.FC<TestAppProps> = ({
  queryClient = createTestQueryClient(),
  initialEntries = ['/protected'],
  initialSessionOverride = TEST_USER,
}) => {
  setupAuthTransport(httpClient);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider initialSessionOverride={initialSessionOverride}>
        <MemoryRouter initialEntries={initialEntries}>
          <Routes>
            <Route path="/auth/login" element={<LoginPage />} />
            <Route
              path="/protected"
              element={
                <ProtectedRoute>
                  <ProtectedPage />
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
};

describe('Track B — Step B2.4: Authenticated API Client Integration', () => {
  let fetchSpy: jest.SpyInstance;
  let refreshCount: number;

  beforeEach(() => {
    refreshCount = 0;
    act(() => {
      authTokenStore.clearSession();
    });

    setupAuthTransport(httpClient);

    if (!global.fetch) {
      (global as unknown as { fetch: typeof fetch }).fetch = jest.fn();
    }

    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation((url) => {
      const urlStr = extractUrl(url);

      if (urlStr.includes('/api/v1/auth/refresh')) {
        refreshCount += 1;
        return Promise.resolve(
          createMockResponse({
            accessToken: 'mock-b2-4-refreshed-token-xyz',
            expiresIn: 900,
          }),
        );
      }

      if (urlStr.includes('/api/v1/auth/me')) {
        return Promise.resolve(createMockResponse(TEST_USER, 200));
      }

      return Promise.resolve(createMockResponse({ status: 'ok' }, 200));
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  // ─── 1. Authenticated Request & Token Attachment ────────────────────────────

  describe('1. Bearer Token Attachment', () => {
    it('automatically attaches Authorization: Bearer <token> header to outgoing feature requests', async () => {
      authTokenStore.setAccessToken('mock-initial-token-123');

      fetchSpy.mockResolvedValueOnce(
        createMockResponse({ items: [{ id: '1', name: 'Client A' }] }, 200),
      );

      const result = await httpClient.get<{ items: Array<{ id: string; name: string }> }>(
        '/api/v1/clients',
      );

      expect(result).toEqual({ items: [{ id: '1', name: 'Client A' }] });
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/clients',
        expect.objectContaining({
          headers: expect.any(Headers),
        }),
      );

      const sentHeaders = fetchSpy.mock.calls[0][1].headers as Headers;
      expect(sentHeaders.get('Authorization')).toBe('Bearer mock-initial-token-123');
    });

    it('bypasses Authorization header injection when skipAuth: true is specified', async () => {
      authTokenStore.setAccessToken('mock-initial-token-123');
      fetchSpy.mockResolvedValueOnce(createMockResponse({ public: true }, 200));

      await httpClient.get('/api/v1/public/status', { skipAuth: true });

      const sentHeaders = fetchSpy.mock.calls[0][1].headers as Headers;
      expect(sentHeaders.get('Authorization')).toBeNull();
    });
  });

  // ─── 2. Expired Access Token & Transparent Request Retry ───────────────────

  describe('2. Expired Access Token & Transparent Retry', () => {
    it('intercepts 401 response, executes silent refresh, and transparently retries request with new token', async () => {
      authTokenStore.setAccessToken('mock-stale-expired-token');

      // 1st call to /energy/metrics returns 401
      // Refresh call returns new token
      // 2nd call to /energy/metrics (retry) returns 200 OK
      fetchSpy.mockImplementation((url, init) => {
        const urlStr = extractUrl(url);

        if (urlStr.includes('/api/v1/energy/metrics')) {
          const headers = init?.headers;
          let authHeader: string | null = null;
          if (headers instanceof Headers) {
            authHeader = headers.get('Authorization');
          }

          if (authHeader === 'Bearer mock-stale-expired-token') {
            return Promise.resolve(createMockResponse({ message: 'Token expired' }, 401));
          }

          if (authHeader === 'Bearer mock-b2-4-refreshed-token-xyz') {
            return Promise.resolve(createMockResponse({ kwhTotal: 4500 }, 200));
          }
        }

        if (urlStr.includes('/api/v1/auth/refresh')) {
          refreshCount += 1;
          return Promise.resolve(
            createMockResponse({ accessToken: 'mock-b2-4-refreshed-token-xyz', expiresIn: 900 }),
          );
        }

        return Promise.resolve(createMockResponse({}, 200));
      });

      const response = await httpClient.get<{ kwhTotal: number }>('/api/v1/energy/metrics');

      // Transparent retry succeeded
      expect(response).toEqual({ kwhTotal: 4500 });
      expect(refreshCount).toBe(1);
      expect(authTokenStore.getAccessToken()).toBe('mock-b2-4-refreshed-token-xyz');
    });
  });

  // ─── 3. Failed Refresh & Session Clearance ─────────────────────────────────

  describe('3. Failed Refresh & Session Clearance', () => {
    it('evicts session and navigates user to /auth/login when refresh fails with 401', async () => {
      authTokenStore.setAccessToken('mock-expired-token');

      fetchSpy.mockImplementation((url) => {
        const urlStr = extractUrl(url);
        if (urlStr.includes('/api/v1/auth/refresh')) {
          return Promise.resolve(
            createMockResponse({ statusCode: 401, message: 'Session revoked' }, 401),
          );
        }
        if (urlStr.includes('/api/v1/protected')) {
          return Promise.resolve(createMockResponse({ message: 'Unauthorized' }, 401));
        }
        return Promise.resolve(createMockResponse({ status: 'ok' }));
      });

      render(<TestApp initialEntries={['/protected']} />);

      // Trigger 401 request
      await act(async () => {
        try {
          await httpClient.get('/api/v1/protected');
        } catch {
          // Expected AuthenticationError
        }
      });

      // User session evicted, token cleared, navigated to /auth/login
      await waitFor(() => {
        expect(screen.getByTestId('login-page')).toBeInTheDocument();
      });

      expect(authTokenStore.getAccessToken()).toBeNull();
    });
  });

  // ─── 4. Refresh Endpoint Exclusion ─────────────────────────────────────────

  describe('4. Refresh Endpoint Exclusion', () => {
    it('does not trigger self-retry when /api/v1/auth/refresh itself returns 401', async () => {
      fetchSpy.mockImplementation((url) => {
        const urlStr = extractUrl(url);
        if (urlStr.includes('/api/v1/auth/refresh')) {
          refreshCount += 1;
          return Promise.resolve(
            createMockResponse({ statusCode: 401, message: 'Invalid refresh token' }, 401),
          );
        }
        return Promise.resolve(createMockResponse({}, 200));
      });

      await expect(httpClient.post('/api/v1/auth/refresh')).rejects.toThrow(AuthenticationError);

      // Exactly 1 request sent, no loop
      expect(refreshCount).toBe(1);
    });
  });

  // ─── 5. Bounded Retry Limit & Loop Prevention ──────────────────────────────

  describe('5. Bounded Retry Limit & Loop Prevention', () => {
    it('stops retrying and throws AuthenticationError if retried request returns 401 again', async () => {
      authTokenStore.setAccessToken('mock-token');

      // Both original and retried request return 401
      fetchSpy.mockImplementation((url) => {
        const urlStr = extractUrl(url);
        if (urlStr.includes('/api/v1/auth/refresh')) {
          return Promise.resolve(
            createMockResponse({ accessToken: 'mock-new-token', expiresIn: 900 }),
          );
        }
        if (urlStr.includes('/api/v1/persistent-401')) {
          return Promise.resolve(createMockResponse({ message: 'Forbidden token' }, 401));
        }
        return Promise.resolve(createMockResponse({}, 200));
      });

      await expect(httpClient.get('/api/v1/persistent-401')).rejects.toThrow(AuthenticationError);

      // In-memory session cleared on double 401
      expect(authTokenStore.getAccessToken()).toBeNull();
    });
  });

  // ─── 6. Concurrent 401 Requests & Single-Flight Deduplication ─────────────

  describe('6. Concurrent 401 Requests', () => {
    it('deduplicates concurrent 401 requests onto a single /api/v1/auth/refresh call', async () => {
      authTokenStore.setAccessToken('mock-stale-token');

      fetchSpy.mockImplementation((url, init) => {
        const urlStr = extractUrl(url);

        if (urlStr.includes('/api/v1/auth/refresh')) {
          refreshCount += 1;
          return Promise.resolve(
            createMockResponse({ accessToken: 'mock-shared-token-777', expiresIn: 900 }),
          );
        }

        if (urlStr.includes('/api/v1/resource-')) {
          const headers = init?.headers;
          let authHeader: string | null = null;
          if (headers instanceof Headers) {
            authHeader = headers.get('Authorization');
          }

          if (authHeader !== 'Bearer mock-shared-token-777') {
            return Promise.resolve(createMockResponse({ message: 'Stale token' }, 401));
          }

          return Promise.resolve(createMockResponse({ success: true }, 200));
        }

        return Promise.resolve(createMockResponse({}, 200));
      });

      const p1 = httpClient.get('/api/v1/resource-1');
      const p2 = httpClient.get('/api/v1/resource-2');
      const p3 = httpClient.get('/api/v1/resource-3');

      const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

      expect(r1).toEqual({ success: true });
      expect(r2).toEqual({ success: true });
      expect(r3).toEqual({ success: true });

      // EXACTLY 1 refresh network call was generated across all 3 concurrent 401s
      expect(refreshCount).toBe(1);
      expect(authTokenStore.getAccessToken()).toBe('mock-shared-token-777');
    });
  });

  // ─── 7. Non-Authentication 4xx Error Behavior ─────────────────────────────

  describe('7. Non-Authentication 4xx Behavior', () => {
    it('normalizes 400 Bad Request to ValidationError without refresh retries', async () => {
      fetchSpy.mockResolvedValueOnce(
        createMockResponse(
          { statusCode: 400, message: 'Invalid payload', details: { name: ['Required'] } },
          400,
        ),
      );

      await expect(httpClient.post('/api/v1/items', {})).rejects.toThrow(ValidationError);
      expect(refreshCount).toBe(0);
    });

    it('normalizes 403 Forbidden to AuthorizationError without refresh retries', async () => {
      fetchSpy.mockResolvedValueOnce(
        createMockResponse({ statusCode: 403, message: 'Insufficient permissions' }, 403),
      );

      await expect(httpClient.get('/api/v1/admin/audit')).rejects.toThrow(AuthorizationError);
      expect(refreshCount).toBe(0);
    });

    it('normalizes 404 Not Found to NotFoundError without refresh retries', async () => {
      fetchSpy.mockResolvedValueOnce(
        createMockResponse({ statusCode: 404, message: 'Resource not found' }, 404),
      );

      await expect(httpClient.get('/api/v1/missing')).rejects.toThrow(NotFoundError);
      expect(refreshCount).toBe(0);
    });

    it('normalizes 429 Rate Limit to RateLimitError without refresh retries', async () => {
      fetchSpy.mockResolvedValueOnce(
        createMockResponse({ statusCode: 429, message: 'Rate limit exceeded' }, 429),
      );

      await expect(httpClient.get('/api/v1/heavy')).rejects.toThrow(RateLimitError);
      expect(refreshCount).toBe(0);
    });
  });

  // ─── 8. 5xx Server Error Behavior ─────────────────────────────────────────

  describe('8. 5xx Server Error Behavior', () => {
    it('normalizes 500 Internal Server Error to ServerError without trigger refresh or session eviction', async () => {
      authTokenStore.setAccessToken('valid-active-token');

      fetchSpy.mockResolvedValueOnce(
        createMockResponse({ statusCode: 500, message: 'Internal Server Error' }, 500),
      );

      await expect(httpClient.get('/api/v1/reports')).rejects.toThrow(ServerError);

      expect(refreshCount).toBe(0);
      expect(authTokenStore.getAccessToken()).toBe('valid-active-token');
    });
  });
});
