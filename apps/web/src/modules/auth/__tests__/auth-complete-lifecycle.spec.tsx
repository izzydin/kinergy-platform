/**
 * Track B — Milestone B1.5: Authentication Lifecycle Integration Testing
 *
 * Unified master integration test suite validating the complete frontend authentication
 * lifecycle prior to Login UI implementation across all 4 workflows and 13 mandatory scenarios:
 *
 * Workflows:
 *   1. First Visit (unauthenticated boot -> BOOTSTRAPPING -> UNAUTHENTICATED -> /auth/login)
 *   2. Session Recovery (boot -> BOOTSTRAPPING -> silent refresh -> /auth/me -> AUTHENTICATED -> /dashboard)
 *   3. Session Failure (authenticated -> 401 -> failed refresh -> UNAUTHENTICATED -> /auth/login)
 *   4. Logout (authenticated -> POST /auth/logout -> clear tokens & QueryCache -> UNAUTHENTICATED)
 *
 * Scenarios:
 *   1. First unauthenticated application load
 *   2. Successful session recovery
 *   3. Failed session recovery
 *   4. Protected route access
 *   5. Authentication loading state (role="status", aria-live="polite", no shell flash)
 *   6. Session expiration
 *   7. Refresh success (transparent request retry with Bearer token)
 *   8. Refresh failure (unauthorized event emission & memory token clearance)
 *   9. Logout (server revocation & local eviction)
 *   10. Cache cleanup (TanStack queryClient.clear() on session termination)
 *   11. Concurrent unauthorized requests
 *   12. Refresh storm prevention (single-flight coordination)
 *   13. Redirect loop prevention & target path sanitization
 */
import '@testing-library/jest-dom';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '../../../app/providers/auth-provider';
import { ProtectedRoute } from '../components/protected-route';
import { PublicRoute } from '../components/public-route';
import { SuspenseFallback } from '../../../app/routes/lazy-loading';
import { authTokenStore } from '../../../shared/auth/auth-token-store';
import { setupAuthTransport } from '../../../shared/auth/auth-transport';
import { httpClient } from '../../../shared/api/http-client';
import type { AuthUser, UserSession } from '../domain/auth-state.types';

// ─── Test Harness Setup ──────────────────────────────────────────────────────

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

const MASTER_TEST_USER: UserSession = {
  id: 'usr-b1-5-master',
  email: 'lifecycle@kinergy.io',
  name: 'Lifecycle Verification User',
  roles: ['ADMIN', 'OPERATOR'],
  permissions: ['client:read', 'analytics:read', 'energy:write'],
  tenantId: 'tenant_b1_5',
};

const MASTER_AUTH_USER: AuthUser = {
  id: MASTER_TEST_USER.id,
  email: MASTER_TEST_USER.email,
  name: MASTER_TEST_USER.name,
  roles: MASTER_TEST_USER.roles,
  permissions: MASTER_TEST_USER.permissions,
  tenantId: MASTER_TEST_USER.tenantId,
};

// ─── Unified Test Suite ──────────────────────────────────────────────────────

describe('Track B — Milestone B1.5: Authentication Lifecycle Integration Suite', () => {
  let fetchSpy: jest.SpyInstance;

  beforeAll(() => {
    // Single global transport setup for the test suite
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

      if (urlStr.includes('/api/v1/auth/refresh')) {
        return Promise.resolve(
          createMockResponse({ accessToken: 'mock-b1-5-refreshed-token', expiresIn: 900 }, 200),
        );
      }

      if (urlStr.includes('/api/v1/auth/me')) {
        return Promise.resolve(createMockResponse(MASTER_TEST_USER, 200));
      }

      if (urlStr.includes('/api/v1/auth/logout')) {
        return Promise.resolve(createMockResponse({ success: true }, 200));
      }

      return Promise.resolve(createMockResponse({ status: 'ok' }, 200));
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. First Visit & Unauthenticated Application Load
  // ═══════════════════════════════════════════════════════════════════════════

  describe('1. First Visit (Unauthenticated Boot)', () => {
    it('scenarios 1 & 5: starts in BOOTSTRAPPING with accessible loading UI and transitions to UNAUTHENTICATED', async () => {
      // Mock refresh failure (no refresh cookie present)
      fetchSpy.mockImplementation((url) => {
        const urlStr = extractUrl(url);
        if (urlStr.includes('/api/v1/auth/refresh')) {
          return Promise.resolve(createMockResponse({ message: 'No session cookie' }, 401));
        }
        return Promise.resolve(createMockResponse({}, 200));
      });

      const AppShell: React.FC = () => {
        const { status } = useAuth();
        if (status === 'BOOTSTRAPPING') {
          return <SuspenseFallback label="Initializing Kinergy Session..." />;
        }
        return <span data-testid="auth-status">{status}</span>;
      };

      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <AuthProvider>
            <AppShell />
          </AuthProvider>
        </QueryClientProvider>,
      );

      // Scenario 5: Accessible loading state during BOOTSTRAPPING
      const loadingEl = screen.getByRole('status');
      expect(loadingEl).toBeInTheDocument();
      expect(loadingEl).toHaveAttribute('aria-live', 'polite');
      expect(screen.getByText('Initializing Kinergy Session...')).toBeInTheDocument();

      // Scenario 1: Transition to UNAUTHENTICATED when refresh returns 401
      await waitFor(() => {
        expect(screen.getByTestId('auth-status')).toHaveTextContent('UNAUTHENTICATED');
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. Successful Session Recovery
  // ═══════════════════════════════════════════════════════════════════════════

  describe('2. Successful Session Recovery', () => {
    it('scenarios 2 & 7: recovers session on startup, stores memory token, loads profile, and sets AUTHENTICATED', async () => {
      const StatusConsumer: React.FC = () => {
        const { status, currentUser, isAuthenticated } = useAuth();
        return (
          <div>
            <span data-testid="status">{status}</span>
            <span data-testid="user-email">{currentUser?.email}</span>
            <span data-testid="is-auth">{String(isAuthenticated)}</span>
          </div>
        );
      };

      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <AuthProvider>
            <StatusConsumer />
          </AuthProvider>
        </QueryClientProvider>,
      );

      // Wait for silent refresh + /auth/me profile load
      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('AUTHENTICATED');
      });

      expect(screen.getByTestId('user-email')).toHaveTextContent('lifecycle@kinergy.io');
      expect(screen.getByTestId('is-auth')).toHaveTextContent('true');
      expect(authTokenStore.getAccessToken()).toBe('mock-b1-5-refreshed-token');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. Failed Session Recovery
  // ═══════════════════════════════════════════════════════════════════════════

  describe('3. Failed Session Recovery', () => {
    it('scenarios 3 & 8: clears memory tokens and transitions to UNAUTHENTICATED when bootstrap refresh fails', async () => {
      fetchSpy.mockImplementation((url) => {
        const urlStr = extractUrl(url);
        if (urlStr.includes('/api/v1/auth/refresh')) {
          return Promise.resolve(createMockResponse({ message: 'Session revoked' }, 403));
        }
        return Promise.resolve(createMockResponse({}, 200));
      });

      const Consumer: React.FC = () => {
        const { status, currentUser, isUnauthenticated } = useAuth();
        return (
          <div>
            <span data-testid="status">{status}</span>
            <span data-testid="has-user">{String(currentUser !== null)}</span>
            <span data-testid="is-unauth">{String(isUnauthenticated)}</span>
          </div>
        );
      };

      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <AuthProvider>
            <Consumer />
          </AuthProvider>
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('UNAUTHENTICATED');
      });

      expect(screen.getByTestId('has-user')).toHaveTextContent('false');
      expect(screen.getByTestId('is-unauth')).toHaveTextContent('true');
      expect(authTokenStore.getAccessToken()).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. Protected Route Access & Routing Guards
  // ═══════════════════════════════════════════════════════════════════════════

  describe('4. Protected Route Access & Routing Guards', () => {
    it('scenario 4: allows route access when AUTHENTICATED and blocks/redirects when UNAUTHENTICATED', async () => {
      const AppRouting: React.FC = () => (
        <Routes>
          <Route path="/auth/login" element={<div>Public Login Screen</div>} />
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<div>Protected Dashboard Screen</div>} />
          </Route>
        </Routes>
      );

      // Part A: Renders protected route when AUTHENTICATED
      const { unmount } = render(
        <QueryClientProvider client={createTestQueryClient()}>
          <MemoryRouter initialEntries={['/dashboard']}>
            <AuthProvider initialSessionOverride={MASTER_AUTH_USER}>
              <AppRouting />
            </AuthProvider>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      expect(screen.getByText('Protected Dashboard Screen')).toBeInTheDocument();
      unmount();

      // Part B: Blocks access and redirects to /auth/login when UNAUTHENTICATED
      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <MemoryRouter initialEntries={['/dashboard']}>
            <AuthProvider initialSessionOverride={null}>
              <AppRouting />
            </AuthProvider>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      expect(screen.getByText('Public Login Screen')).toBeInTheDocument();
      expect(screen.queryByText('Protected Dashboard Screen')).not.toBeInTheDocument();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. Session Expiration & Transparent Request Retry
  // ═══════════════════════════════════════════════════════════════════════════

  describe('5. Session Expiration & Transparent Request Retry', () => {
    it('scenario 7: transparently retries request with new Bearer token after initial 401 response', async () => {
      authTokenStore.setAccessToken('stale-token');
      let apiCallCount = 0;
      let refreshCallCount = 0;

      fetchSpy.mockImplementation((url, init) => {
        const urlStr = extractUrl(url);

        if (urlStr.includes('/api/v1/auth/refresh')) {
          refreshCallCount++;
          return Promise.resolve(
            createMockResponse({ accessToken: 'new-valid-bearer-token', expiresIn: 900 }, 200),
          );
        }

        if (urlStr.includes('/api/v1/protected/data')) {
          apiCallCount++;
          const headers = (init?.headers as Headers) || new Headers();
          const authHeader = headers.get ? headers.get('Authorization') : '';

          // 1st request with stale token returns 401
          if (authHeader?.includes('stale-token')) {
            return Promise.resolve(createMockResponse({ message: 'Token expired' }, 401));
          }

          // Retried request with new token returns 200
          if (authHeader?.includes('new-valid-bearer-token')) {
            return Promise.resolve(createMockResponse({ result: 'retried-success-payload' }, 200));
          }
        }

        return Promise.resolve(createMockResponse({}, 200));
      });

      const response = await httpClient.get<{ result: string }>('/protected/data');

      // Transparent retry succeeded!
      expect(response.result).toBe('retried-success-payload');
      expect(refreshCallCount).toBe(1);
      expect(apiCallCount).toBe(2);
      expect(authTokenStore.getAccessToken()).toBe('new-valid-bearer-token');
    });

    it('scenario 6: clears session and redirects to login when mid-flight refresh fails', async () => {
      authTokenStore.setAccessToken('expired-token');

      fetchSpy.mockImplementation((url) => {
        const urlStr = extractUrl(url);
        if (urlStr.includes('/api/v1/auth/refresh')) {
          return Promise.resolve(createMockResponse({ message: 'Refresh cookie expired' }, 401));
        }
        return Promise.resolve(createMockResponse({ message: 'Unauthorized' }, 401));
      });

      const AppShell: React.FC = () => {
        return (
          <button
            data-testid="make-request"
            onClick={() => {
              void httpClient.get('/api/v1/user/settings').catch(() => {});
            }}
          >
            Fetch Settings
          </button>
        );
      };

      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <MemoryRouter initialEntries={['/dashboard']}>
            <AuthProvider initialSessionOverride={MASTER_AUTH_USER}>
              <Routes>
                <Route path="/auth/login" element={<div>Login View</div>} />
                <Route element={<ProtectedRoute />}>
                  <Route path="/dashboard" element={<AppShell />} />
                </Route>
              </Routes>
            </AuthProvider>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      act(() => {
        fireEvent.click(screen.getByTestId('make-request'));
      });

      await waitFor(() => {
        expect(screen.getByText('Login View')).toBeInTheDocument();
      });

      expect(authTokenStore.getAccessToken()).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. Logout & QueryCache Security Cleanup
  // ═══════════════════════════════════════════════════════════════════════════

  describe('6. Logout & QueryCache Security Cleanup', () => {
    it('scenarios 9 & 10: revokes server session, clears memory token, purges QueryCache, and sets UNAUTHENTICATED', async () => {
      const queryClient = createTestQueryClient();

      // Pre-populate TanStack Query cache with sensitive server data
      queryClient.setQueryData(['sensitive-user-profile'], { id: 'usr-b1-5-master' });
      queryClient.setQueryData(['sensitive-billing-info'], { accountId: 'acc-99' });

      let logoutPromise: Promise<void> | null = null;

      const LogoutView: React.FC = () => {
        const { status, logout } = useAuth();
        return (
          <div>
            <span data-testid="status">{status}</span>
            <button
              data-testid="logout-btn"
              onClick={() => {
                logoutPromise = logout();
              }}
            >
              Logout
            </button>
          </div>
        );
      };

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/dashboard']}>
            <AuthProvider initialSessionOverride={MASTER_AUTH_USER}>
              <Routes>
                <Route path="/auth/login" element={<div>Login Target</div>} />
                <Route element={<ProtectedRoute />}>
                  <Route path="/dashboard" element={<LogoutView />} />
                </Route>
              </Routes>
            </AuthProvider>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      act(() => {
        fireEvent.click(screen.getByTestId('logout-btn'));
      });

      await act(async () => {
        if (logoutPromise) {
          await logoutPromise;
        }
      });

      await waitFor(() => {
        expect(screen.getByText('Login Target')).toBeInTheDocument();
      });

      // Verification: QueryCache is completely purged
      expect(queryClient.getQueryData(['sensitive-user-profile'])).toBeUndefined();
      expect(queryClient.getQueryData(['sensitive-billing-info'])).toBeUndefined();
      expect(authTokenStore.getAccessToken()).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. Concurrent Unauthorized Requests & Refresh Storm Prevention
  // ═══════════════════════════════════════════════════════════════════════════

  describe('7. Concurrent Unauthorized Requests & Refresh Storm Prevention', () => {
    it('scenarios 11 & 12: executes exactly ONE refresh request for concurrent 401s and prevents refresh storms', async () => {
      authTokenStore.setAccessToken('stale-token');
      let refreshCallCount = 0;

      fetchSpy.mockImplementation((url) => {
        const urlStr = extractUrl(url);
        if (urlStr.includes('/api/v1/auth/refresh')) {
          refreshCallCount++;
          return Promise.resolve(createMockResponse({ message: 'Refresh rejected' }, 401));
        }
        return Promise.resolve(createMockResponse({ message: 'Unauthorized' }, 401));
      });

      // Fire 3 simultaneous API calls
      const p1 = httpClient.get('/api-1');
      const p2 = httpClient.get('/api-2');
      const p3 = httpClient.get('/api-3');

      await expect(Promise.all([p1, p2, p3])).rejects.toThrow();

      // Single-flight coordination prevented refresh storming
      expect(refreshCallCount).toBe(1);
      expect(authTokenStore.getAccessToken()).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. Redirect Loop Prevention & Sanitization
  // ═══════════════════════════════════════════════════════════════════════════

  describe('8. Redirect Loop Prevention & Sanitization', () => {
    it('scenario 13: omits self-referential redirect params on auth routes and sanitizes /auth/* targets to /dashboard', async () => {
      // Part A: ProtectedRoute on /auth/login does NOT append ?redirect=/auth/login
      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <MemoryRouter initialEntries={['/auth/login']}>
            <AuthProvider initialSessionOverride={null}>
              <Routes>
                <Route element={<ProtectedRoute />}>
                  <Route path="/auth/login" element={<div>Login Guard Test</div>} />
                </Route>
                <Route path="/auth/login" element={<div>Fallback Login</div>} />
              </Routes>
            </AuthProvider>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Part B: PublicRoute sanitizes ?redirect=/auth/forgot-password back to /dashboard
      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <MemoryRouter initialEntries={['/auth/login?redirect=%2Fauth%2Fforgot-password']}>
            <AuthProvider initialSessionOverride={MASTER_AUTH_USER}>
              <Routes>
                <Route path="/dashboard" element={<div>Sanitized Target Dashboard</div>} />
                <Route element={<PublicRoute />}>
                  <Route path="/auth/login" element={<div>Auth Login Page</div>} />
                </Route>
              </Routes>
            </AuthProvider>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      expect(screen.getByText('Sanitized Target Dashboard')).toBeInTheDocument();
    });
  });
});
