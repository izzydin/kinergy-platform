/**
 * Track B — Milestone B1.4: Logout & Authentication Failure Recovery
 *
 * Comprehensive integration test suite validating explicit logout, network resilience
 * during logout, runtime 401 session expiration, QueryCache security purging,
 * concurrent failure handling, and infinite retry loop prevention.
 *
 * Coverage:
 *   1. Explicit Successful Logout — POST /auth/logout, clears token & QueryCache, sets UNAUTHENTICATED
 *   2. Resilient Logout on Network Failure — Clears local session even if server logout throws 500
 *   3. Expired Runtime Session — 401 + failed refresh triggers unauthorized event & session eviction
 *   4. Revoked Runtime Session — 401 TOKEN_REVOKED clears state and memory token
 *   5. Authenticated QueryCache Security — Verifies TanStack queryCache is completely purged on logout
 *   6. Automatic Redirect after Session Loss — Navigating protected routes after session loss redirects to /auth/login
 *   7. Concurrent Failed Requests — Single-flight refresh attempt on multiple 401s
 *   8. Infinite Retry Loop Prevention — Retried 401 (X-Retry-Attempt: 1) terminates without re-refreshing
 */
import '@testing-library/jest-dom';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '../../../app/providers/auth-provider';
import { ProtectedRoute } from '../components/protected-route';
import { authTokenStore } from '../../../shared/auth/auth-token-store';
import { setupAuthTransport } from '../../../shared/auth/auth-transport';
import { httpClient } from '../../../shared/api/http-client';
import { AuthUser } from '../domain/auth-state.types';

// ─── Test Infrastructure ─────────────────────────────────────────────────────

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

const B14_TEST_USER: AuthUser = {
  id: 'usr-b1-4-test',
  email: 'logout@kinergy.io',
  name: 'Logout Test User',
  roles: ['OPERATOR', 'ADMIN'],
  permissions: ['client:read', 'energy:read'],
  tenantId: 'tenant_b1_4',
};

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('Track B — Milestone B1.4: Logout & Authentication Failure Recovery', () => {
  let fetchSpy: jest.SpyInstance;

  beforeAll(() => {
    // Wire transport interceptor ONCE for the entire test suite to prevent duplicate interceptors
    setupAuthTransport(httpClient);
  });

  beforeEach(() => {
    act(() => {
      authTokenStore.clearSession();
    });

    if (!global.fetch) {
      (global as unknown as { fetch: typeof fetch }).fetch = jest.fn();
    }

    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation((url) => {
      const urlStr = extractUrl(url);

      if (urlStr.includes('/api/v1/auth/logout')) {
        return Promise.resolve(createMockResponse({ success: true }, 200));
      }

      if (urlStr.includes('/api/v1/auth/refresh')) {
        return Promise.resolve(
          createMockResponse({ accessToken: 'mock-b1-4-refreshed-token', expiresIn: 900 }, 200),
        );
      }

      if (urlStr.includes('/api/v1/auth/me')) {
        return Promise.resolve(createMockResponse(B14_TEST_USER, 200));
      }

      return Promise.resolve(createMockResponse({ status: 'ok' }, 200));
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. Explicit Successful Logout
  // ═══════════════════════════════════════════════════════════════════════════

  describe('1. Explicit Successful Logout', () => {
    it('executes server logout, clears memory access token, and sets status to UNAUTHENTICATED', async () => {
      let capturedLogoutPromise: Promise<void> | null = null;

      const LogoutConsumer: React.FC = () => {
        const { status, logout, isAuthenticated } = useAuth();
        return (
          <div>
            <span data-testid="status">{status}</span>
            <span data-testid="is-authenticated">{String(isAuthenticated)}</span>
            <button
              data-testid="logout-btn"
              onClick={() => {
                capturedLogoutPromise = logout();
              }}
            >
              Logout
            </button>
          </div>
        );
      };

      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <AuthProvider initialSessionOverride={B14_TEST_USER}>
            <LogoutConsumer />
          </AuthProvider>
        </QueryClientProvider>,
      );

      // Pre-condition: User is authenticated
      expect(screen.getByTestId('status')).toHaveTextContent('AUTHENTICATED');
      expect(screen.getByTestId('is-authenticated')).toHaveTextContent('true');

      // Trigger logout action
      act(() => {
        fireEvent.click(screen.getByTestId('logout-btn'));
      });

      await act(async () => {
        if (capturedLogoutPromise) {
          await capturedLogoutPromise;
        }
      });

      // Post-condition: Transitions to UNAUTHENTICATED
      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('UNAUTHENTICATED');
      });

      expect(screen.getByTestId('is-authenticated')).toHaveTextContent('false');
      expect(authTokenStore.getAccessToken()).toBeNull();

      // Verify POST /auth/logout request was sent to server
      const logoutCall = fetchSpy.mock.calls.find(([url]) =>
        extractUrl(url).includes('/api/v1/auth/logout'),
      );
      expect(logoutCall).toBeDefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. Resilient Logout on Network Failure
  // ═══════════════════════════════════════════════════════════════════════════

  describe('2. Resilient Logout on Network Failure', () => {
    it('clears local session and transitions to UNAUTHENTICATED even when POST /auth/logout fails with HTTP 500', async () => {
      fetchSpy.mockImplementation((url) => {
        const urlStr = extractUrl(url);
        if (urlStr.includes('/api/v1/auth/logout')) {
          return Promise.resolve(createMockResponse({ message: 'Internal Server Error' }, 500));
        }
        return Promise.resolve(createMockResponse({}, 200));
      });

      let capturedLogoutPromise: Promise<void> | null = null;

      const LogoutConsumer: React.FC = () => {
        const { status, logout } = useAuth();
        return (
          <div>
            <span data-testid="status">{status}</span>
            <button
              data-testid="logout-btn"
              onClick={() => {
                capturedLogoutPromise = logout();
              }}
            >
              Logout
            </button>
          </div>
        );
      };

      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <AuthProvider initialSessionOverride={B14_TEST_USER}>
            <LogoutConsumer />
          </AuthProvider>
        </QueryClientProvider>,
      );

      expect(screen.getByTestId('status')).toHaveTextContent('AUTHENTICATED');

      act(() => {
        fireEvent.click(screen.getByTestId('logout-btn'));
      });

      await act(async () => {
        if (capturedLogoutPromise) {
          await capturedLogoutPromise;
        }
      });

      // Even though the server returned 500, local eviction MUST succeed inside finally block
      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('UNAUTHENTICATED');
      });

      expect(authTokenStore.getAccessToken()).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. Expired Runtime Session & Intercepted 401
  // ═══════════════════════════════════════════════════════════════════════════

  describe('3. Expired Runtime Session & Intercepted 401', () => {
    it('emits unauthorized event on failed runtime refresh, evicting session and transitioning to UNAUTHENTICATED', async () => {
      const listener = jest.fn();
      authTokenStore.subscribe(listener);
      authTokenStore.setAccessToken('expired-access-token');

      // Mock sequence: GET /data returns 401; POST /auth/refresh returns 401
      fetchSpy.mockImplementation((url) => {
        const urlStr = extractUrl(url);
        if (urlStr.includes('/auth/refresh')) {
          return Promise.resolve(createMockResponse({ message: 'Refresh token expired' }, 401));
        }
        return Promise.resolve(createMockResponse({ message: 'Token expired' }, 401));
      });

      const RuntimeApiConsumer: React.FC = () => {
        const { status } = useAuth();
        return <span data-testid="status">{status}</span>;
      };

      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <AuthProvider initialSessionOverride={B14_TEST_USER}>
            <RuntimeApiConsumer />
          </AuthProvider>
        </QueryClientProvider>,
      );

      // Trigger authenticated API request through httpClient
      await expect(httpClient.get('/data')).rejects.toThrow();

      // Verify that unauthorized event was emitted and token was cleared
      expect(listener).toHaveBeenCalledWith('unauthorized');
      expect(authTokenStore.getAccessToken()).toBeNull();

      // State transitions to UNAUTHENTICATED
      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('UNAUTHENTICATED');
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. Revoked Runtime Session
  // ═══════════════════════════════════════════════════════════════════════════

  describe('4. Revoked Runtime Session', () => {
    it('evicts session when silent refresh returns 401 TOKEN_REVOKED during runtime request retry', async () => {
      authTokenStore.setAccessToken('revoked-access-token');

      fetchSpy.mockImplementation((url) => {
        const urlStr = extractUrl(url);
        if (urlStr.includes('/auth/refresh')) {
          return Promise.resolve(
            createMockResponse({ message: 'Token revoked', error: 'TOKEN_REVOKED' }, 401),
          );
        }
        return Promise.resolve(createMockResponse({ message: 'Unauthorized' }, 401));
      });

      const Consumer: React.FC = () => {
        const { status } = useAuth();
        return <span data-testid="status">{status}</span>;
      };

      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <AuthProvider initialSessionOverride={B14_TEST_USER}>
            <Consumer />
          </AuthProvider>
        </QueryClientProvider>,
      );

      await expect(httpClient.get('/protected-resource')).rejects.toThrow();

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('UNAUTHENTICATED');
      });

      expect(authTokenStore.getAccessToken()).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. Authenticated QueryCache Security
  // ═══════════════════════════════════════════════════════════════════════════

  describe('5. Authenticated QueryCache Security', () => {
    it('purges all cached TanStack Query data on logout to prevent state leakage to subsequent users', async () => {
      const queryClient = createTestQueryClient();

      // Pre-populate query cache with sensitive user server state
      queryClient.setQueryData(['user-profile'], { id: B14_TEST_USER.id, secret: 'sensitive' });
      queryClient.setQueryData(['client-telemetry'], { meterId: 'm-99', reading: 4500 });

      expect(queryClient.getQueryData(['user-profile'])).toBeDefined();
      expect(queryClient.getQueryData(['client-telemetry'])).toBeDefined();

      let capturedLogoutPromise: Promise<void> | null = null;

      const Consumer: React.FC = () => {
        const { logout } = useAuth();
        return (
          <button
            data-testid="logout-btn"
            onClick={() => {
              capturedLogoutPromise = logout();
            }}
          >
            Logout
          </button>
        );
      };

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/dashboard']}>
            <AuthProvider initialSessionOverride={B14_TEST_USER}>
              <Routes>
                <Route path="/auth/login" element={<div>Login Target View</div>} />
                <Route element={<ProtectedRoute />}>
                  <Route path="/dashboard" element={<Consumer />} />
                </Route>
              </Routes>
            </AuthProvider>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Perform logout
      act(() => {
        fireEvent.click(screen.getByTestId('logout-btn'));
      });

      await act(async () => {
        if (capturedLogoutPromise) {
          await capturedLogoutPromise;
        }
      });

      // Verify QueryCache was completely cleared
      expect(queryClient.getQueryData(['user-profile'])).toBeUndefined();
      expect(queryClient.getQueryData(['client-telemetry'])).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. Automatic Redirect After Session Loss
  // ═══════════════════════════════════════════════════════════════════════════

  describe('6. Automatic Redirect After Session Loss', () => {
    it('automatically redirects protected route view to /auth/login?redirect=... when runtime session is lost', async () => {
      authTokenStore.setAccessToken('active-token-session');

      fetchSpy.mockImplementation((url) => {
        const urlStr = extractUrl(url);
        if (urlStr.includes('/auth/refresh')) {
          return Promise.resolve(createMockResponse({ message: 'Refresh rejected' }, 401));
        }
        return Promise.resolve(createMockResponse({ message: 'Session invalidated' }, 401));
      });

      const TriggerSessionLossButton: React.FC = () => {
        return (
          <button
            data-testid="trigger-loss"
            onClick={() => {
              void httpClient.get('/api/v1/protected/metrics').catch(() => {});
            }}
          >
            Trigger API Error
          </button>
        );
      };

      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <MemoryRouter initialEntries={['/analytics']}>
            <AuthProvider initialSessionOverride={B14_TEST_USER}>
              <Routes>
                <Route path="/auth/login" element={<div>Login Screen Entry</div>} />
                <Route element={<ProtectedRoute />}>
                  <Route
                    path="/analytics"
                    element={
                      <div>
                        <span>Analytics Dashboard</span>
                        <TriggerSessionLossButton />
                      </div>
                    }
                  />
                </Route>
              </Routes>
            </AuthProvider>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Pre-condition: Renders protected content
      expect(screen.getByText('Analytics Dashboard')).toBeInTheDocument();

      // Trigger 401 API failure -> refresh failure -> notifyUnauthorized
      act(() => {
        fireEvent.click(screen.getByTestId('trigger-loss'));
      });

      // Post-condition: Automatically redirects away from protected view to /auth/login
      await waitFor(() => {
        expect(screen.getByText('Login Screen Entry')).toBeInTheDocument();
      });

      expect(screen.queryByText('Analytics Dashboard')).not.toBeInTheDocument();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. Concurrent Failed Requests & Single-Flight Refresh
  // ═══════════════════════════════════════════════════════════════════════════

  describe('7. Concurrent Failed Requests & Single-Flight Refresh', () => {
    it('executes exactly ONE refresh attempt when 3 concurrent requests return 401 simultaneously', async () => {
      authTokenStore.setAccessToken('stale-token');
      let refreshCallCount = 0;

      fetchSpy.mockImplementation((url) => {
        const urlStr = extractUrl(url);
        if (urlStr.includes('/auth/refresh')) {
          refreshCallCount++;
          return Promise.resolve(createMockResponse({ message: 'Refresh rejected' }, 401));
        }
        return Promise.resolve(createMockResponse({ message: 'Unauthorized' }, 401));
      });

      // Fire 3 simultaneous API requests
      const request1 = httpClient.get('/req-1');
      const request2 = httpClient.get('/req-2');
      const request3 = httpClient.get('/req-3');

      await expect(Promise.all([request1, request2, request3])).rejects.toThrow();

      // Exactly ONE refresh request was made (single-flight coordination)
      expect(refreshCallCount).toBe(1);
      expect(authTokenStore.getAccessToken()).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. Infinite Retry Loop Prevention
  // ═══════════════════════════════════════════════════════════════════════════

  describe('8. Infinite Retry Loop Prevention', () => {
    it('prevents infinite retry loops when a retried request (X-Retry-Attempt: 1) still returns 401', async () => {
      authTokenStore.setAccessToken('initial-token');
      let refreshCallCount = 0;

      fetchSpy.mockImplementation((url) => {
        const urlStr = extractUrl(url);
        if (urlStr.includes('/auth/refresh')) {
          refreshCallCount++;
          return Promise.resolve(
            createMockResponse({ accessToken: 'retried-new-token', expiresIn: 900 }, 200),
          );
        }
        // Initial request returns 401; retried request ALSO returns 401 (e.g. revoked role)
        return Promise.resolve(createMockResponse({ message: 'Forbidden 401' }, 401));
      });

      await expect(httpClient.get('/strict-endpoint')).rejects.toThrow();

      // Refresh was called once to get new token, but when retried request failed with 401,
      // it did NOT trigger a second refresh request!
      expect(refreshCallCount).toBe(1);
      expect(authTokenStore.getAccessToken()).toBeNull();
    });
  });
});
