/**
 * Track B — Milestone B1.2: Authentication Bootstrap & Silent Session Recovery
 *
 * Comprehensive integration test suite validating all 10 mandated bootstrap scenarios.
 *
 * Scenarios:
 *   1.  Startup with valid refresh session
 *   2.  Startup without session (no refresh cookie — 401 "No refresh token present")
 *   3.  Expired refresh token (401 "TOKEN_EXPIRED")
 *   4.  Revoked refresh token (401 "TOKEN_REVOKED")
 *   5a. Blocked user — rejection at refresh layer (403)
 *   5b. Blocked user — rejection at profile layer (/me returns 403)
 *   6a. Temporary network failure (5xx) — must resolve to AUTHENTICATION_ERROR, not UNAUTHENTICATED
 *   6b. Retry after network failure — AUTHENTICATION_ERROR → AUTHENTICATED on success
 *   7.  Multiple concurrent refresh attempts — single-flight coordination via AuthTransportManager
 *   8.  Access token stored in memory only (never localStorage / sessionStorage)
 *   9a. Protected content hidden during bootstrap (loading UI, no redirect)
 *   9b. Redirect to /auth/login only AFTER bootstrap confirms UNAUTHENTICATED
 *  10.  Successful full lifecycle — BOOTSTRAPPING → AUTHENTICATED with backend-sourced user data
 *
 * Architecture under test:
 *   Bootstrap:  useAuthState.executeBootstrap() → performSilentRefresh() → fetchCurrentUser()
 *   Errors:     Fail-closed (401/403 → UNAUTHENTICATED) + Fail-open (5xx → AUTHENTICATION_ERROR)
 *   Token:      AuthTokenStore — memory-only, never Web Storage
 *   Concurrency: AuthTransportManager.acquireRefreshedToken() — single-flight promise gate
 *
 * See ADR-FE-0031 (Bootstrap/Runtime Refresh Separation) documented in use-auth-state.ts.
 */
import '@testing-library/jest-dom';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '../../../app/providers/auth-provider';
import { ProtectedRoute } from '../components/protected-route';
import { AuthTokenStore, authTokenStore } from '../../../shared/auth/auth-token-store';
import { AuthTransportManager, setupAuthTransport } from '../../../shared/auth/auth-transport';
import { httpClient } from '../../../shared/api/http-client';
import { UserSession } from '../domain/auth-state.types';

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

const B12_ACCESS_TOKEN = 'mock-b1-2-bootstrap-token';

const B12_USER: UserSession = {
  id: 'usr-b1-2-test',
  email: 'bootstrap@kinergy.io',
  name: 'Bootstrap Test User',
  roles: ['OPERATOR'],
  permissions: ['client:read', 'energy:read'],
  tenantId: 'tenant_b1_2',
};

interface WrapperProps {
  children: React.ReactNode;
}

const TestWrapper: React.FC<WrapperProps> = ({ children }) => (
  <QueryClientProvider client={createTestQueryClient()}>
    <AuthProvider>{children}</AuthProvider>
  </QueryClientProvider>
);

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('Track B — Milestone B1.2: Authentication Bootstrap & Silent Session Recovery', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    act(() => {
      authTokenStore.clearSession();
    });

    setupAuthTransport(httpClient);

    if (!global.fetch) {
      (global as unknown as { fetch: typeof fetch }).fetch = jest.fn();
    }

    // Default happy-path mock: refresh succeeds → user profile loaded
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation((url) => {
      const urlStr = extractUrl(url);

      if (urlStr.includes('/api/v1/auth/refresh')) {
        return Promise.resolve(
          createMockResponse({ accessToken: B12_ACCESS_TOKEN, expiresIn: 900 }, 200),
        );
      }

      if (urlStr.includes('/api/v1/auth/me')) {
        return Promise.resolve(createMockResponse(B12_USER, 200));
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
  // Scenario 1: Startup with valid refresh session
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Scenario 1: Startup with valid refresh session', () => {
    it('performs silent refresh, stores access token in memory, fetches user from backend, and transitions to AUTHENTICATED', async () => {
      const Consumer: React.FC = () => {
        const { status, currentUser, isAuthenticated } = useAuth();
        return (
          <div>
            <span data-testid="status">{status}</span>
            <span data-testid="user-name">{currentUser?.name ?? 'null'}</span>
            <span data-testid="user-id">{currentUser?.id ?? 'null'}</span>
            <span data-testid="is-authenticated">{String(isAuthenticated)}</span>
          </div>
        );
      };

      render(
        <TestWrapper>
          <Consumer />
        </TestWrapper>,
      );

      // Starts in BOOTSTRAPPING
      expect(screen.getByTestId('status')).toHaveTextContent('BOOTSTRAPPING');
      expect(screen.getByTestId('user-name')).toHaveTextContent('null');

      // Completes as AUTHENTICATED with correct user data
      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('AUTHENTICATED');
      });

      expect(screen.getByTestId('user-name')).toHaveTextContent('Bootstrap Test User');
      expect(screen.getByTestId('user-id')).toHaveTextContent(B12_USER.id);
      expect(screen.getByTestId('is-authenticated')).toHaveTextContent('true');
      expect(authTokenStore.getAccessToken()).toBe(B12_ACCESS_TOKEN);

      // /refresh called before /me — backend is the source of truth
      const calls = fetchSpy.mock.calls.map(([url]) => extractUrl(url));
      const refreshIdx = calls.findIndex((u) => u.includes('/auth/refresh'));
      const meIdx = calls.findIndex((u) => u.includes('/auth/me'));
      expect(refreshIdx).toBeGreaterThanOrEqual(0);
      expect(meIdx).toBeGreaterThan(refreshIdx);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Scenario 2: Startup without session (no refresh cookie)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Scenario 2: Startup without session (no refresh cookie)', () => {
    it('transitions to UNAUTHENTICATED on 401 "No refresh token present" and never calls /me', async () => {
      fetchSpy.mockImplementation((url) => {
        if (extractUrl(url).includes('/api/v1/auth/refresh')) {
          return Promise.resolve(
            createMockResponse({ message: 'No refresh token present', statusCode: 401 }, 401),
          );
        }
        return Promise.resolve(createMockResponse({}, 200));
      });

      const Consumer: React.FC = () => {
        const { status, currentUser, isUnauthenticated } = useAuth();
        return (
          <div>
            <span data-testid="status">{status}</span>
            <span data-testid="has-user">{String(currentUser !== null)}</span>
            <span data-testid="is-unauthenticated">{String(isUnauthenticated)}</span>
          </div>
        );
      };

      render(
        <TestWrapper>
          <Consumer />
        </TestWrapper>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('UNAUTHENTICATED');
      });

      expect(screen.getByTestId('has-user')).toHaveTextContent('false');
      expect(screen.getByTestId('is-unauthenticated')).toHaveTextContent('true');
      expect(authTokenStore.getAccessToken()).toBeNull();

      // /me must NOT be called when refresh fails
      const calls = fetchSpy.mock.calls.map(([url]) => extractUrl(url));
      expect(calls.some((u) => u.includes('/auth/me'))).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Scenario 3: Expired refresh token
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Scenario 3: Expired refresh token', () => {
    it('transitions to UNAUTHENTICATED on 401 "TOKEN_EXPIRED" and clears token state', async () => {
      fetchSpy.mockImplementation((url) => {
        if (extractUrl(url).includes('/api/v1/auth/refresh')) {
          return Promise.resolve(
            createMockResponse(
              { message: 'Refresh token has expired', statusCode: 401, error: 'TOKEN_EXPIRED' },
              401,
            ),
          );
        }
        return Promise.resolve(createMockResponse({}, 200));
      });

      const Consumer: React.FC = () => {
        const { status, isUnauthenticated } = useAuth();
        return (
          <div>
            <span data-testid="status">{status}</span>
            <span data-testid="is-unauthenticated">{String(isUnauthenticated)}</span>
          </div>
        );
      };

      render(
        <TestWrapper>
          <Consumer />
        </TestWrapper>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('UNAUTHENTICATED');
      });

      expect(screen.getByTestId('is-unauthenticated')).toHaveTextContent('true');
      expect(authTokenStore.getAccessToken()).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Scenario 4: Revoked refresh token
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Scenario 4: Revoked refresh token', () => {
    it('transitions to UNAUTHENTICATED on 401 "TOKEN_REVOKED" and clears token state', async () => {
      fetchSpy.mockImplementation((url) => {
        if (extractUrl(url).includes('/api/v1/auth/refresh')) {
          return Promise.resolve(
            createMockResponse(
              {
                message: 'Refresh token has been revoked',
                statusCode: 401,
                error: 'TOKEN_REVOKED',
              },
              401,
            ),
          );
        }
        return Promise.resolve(createMockResponse({}, 200));
      });

      const Consumer: React.FC = () => {
        const { status } = useAuth();
        return <span data-testid="status">{status}</span>;
      };

      render(
        <TestWrapper>
          <Consumer />
        </TestWrapper>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('UNAUTHENTICATED');
      });

      expect(authTokenStore.getAccessToken()).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Scenario 5: Blocked or inactive user
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Scenario 5: Blocked or inactive user', () => {
    it('5a: transitions to UNAUTHENTICATED when the refresh endpoint returns 403 (user blocked at token level)', async () => {
      fetchSpy.mockImplementation((url) => {
        if (extractUrl(url).includes('/api/v1/auth/refresh')) {
          return Promise.resolve(
            createMockResponse(
              { message: 'User account has been suspended', statusCode: 403 },
              403,
            ),
          );
        }
        return Promise.resolve(createMockResponse({}, 200));
      });

      const Consumer: React.FC = () => {
        const { status } = useAuth();
        return <span data-testid="status">{status}</span>;
      };

      render(
        <TestWrapper>
          <Consumer />
        </TestWrapper>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('UNAUTHENTICATED');
      });

      expect(authTokenStore.getAccessToken()).toBeNull();
    });

    it('5b: transitions to UNAUTHENTICATED and clears token when /me returns 403 after a successful refresh', async () => {
      // Refresh succeeds → token briefly stored → /me says 403 → session must be cleared
      fetchSpy.mockImplementation((url) => {
        const urlStr = extractUrl(url);
        if (urlStr.includes('/api/v1/auth/refresh')) {
          return Promise.resolve(
            createMockResponse({ accessToken: B12_ACCESS_TOKEN, expiresIn: 900 }, 200),
          );
        }
        if (urlStr.includes('/api/v1/auth/me')) {
          return Promise.resolve(
            createMockResponse(
              { message: 'User account has been deactivated', statusCode: 403 },
              403,
            ),
          );
        }
        return Promise.resolve(createMockResponse({}, 200));
      });

      const Consumer: React.FC = () => {
        const { status, currentUser } = useAuth();
        return (
          <div>
            <span data-testid="status">{status}</span>
            <span data-testid="has-user">{String(currentUser !== null)}</span>
          </div>
        );
      };

      render(
        <TestWrapper>
          <Consumer />
        </TestWrapper>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('UNAUTHENTICATED');
      });

      // Token that was briefly stored on successful refresh must be cleared on /me 403
      expect(authTokenStore.getAccessToken()).toBeNull();
      expect(screen.getByTestId('has-user')).toHaveTextContent('false');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Scenario 6: Temporary network failure
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Scenario 6: Temporary network failure', () => {
    it('6a: transitions to AUTHENTICATION_ERROR (NOT UNAUTHENTICATED) on a 5xx server error — fail-open strategy', async () => {
      fetchSpy.mockImplementation((url) => {
        if (extractUrl(url).includes('/api/v1/auth/refresh')) {
          return Promise.resolve(
            createMockResponse({ message: 'Authentication gateway temporarily unavailable' }, 503),
          );
        }
        return Promise.resolve(createMockResponse({}, 200));
      });

      const Consumer: React.FC = () => {
        const { status, error } = useAuth();
        return (
          <div>
            <span data-testid="status">{status}</span>
            <span data-testid="has-error">{String(error !== null)}</span>
          </div>
        );
      };

      render(
        <TestWrapper>
          <Consumer />
        </TestWrapper>,
      );

      // CRITICAL: A 5xx error must NOT evict the user from their session.
      // The refresh token may still be valid once the server recovers.
      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('AUTHENTICATION_ERROR');
      });

      expect(screen.getByTestId('has-error')).toHaveTextContent('true');
      // Access token was never stored (there was none to clear)
      expect(authTokenStore.getAccessToken()).toBeNull();
    });

    it('6b: retryBootstrap() successfully recovers after a transient failure — AUTHENTICATION_ERROR → AUTHENTICATED', async () => {
      let attempt = 0;
      fetchSpy.mockImplementation((url) => {
        const urlStr = extractUrl(url);
        if (urlStr.includes('/api/v1/auth/refresh')) {
          attempt++;
          if (attempt === 1) {
            return Promise.resolve(createMockResponse({ message: 'Gateway timeout' }, 504));
          }
          return Promise.resolve(
            createMockResponse({ accessToken: B12_ACCESS_TOKEN, expiresIn: 900 }, 200),
          );
        }
        if (urlStr.includes('/api/v1/auth/me')) {
          return Promise.resolve(createMockResponse(B12_USER, 200));
        }
        return Promise.resolve(createMockResponse({}, 200));
      });

      const Consumer: React.FC = () => {
        const { status, retryBootstrap } = useAuth();
        return (
          <div>
            <span data-testid="status">{status}</span>
            <button data-testid="retry" onClick={() => void retryBootstrap()}>
              Retry
            </button>
          </div>
        );
      };

      render(
        <TestWrapper>
          <Consumer />
        </TestWrapper>,
      );

      // First attempt fails → AUTHENTICATION_ERROR
      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('AUTHENTICATION_ERROR');
      });

      // Trigger retry (user clicks "Retry Connection")
      screen.getByTestId('retry').click();

      // Second attempt succeeds → AUTHENTICATED
      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('AUTHENTICATED');
      });

      expect(authTokenStore.getAccessToken()).toBe(B12_ACCESS_TOKEN);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Scenario 7: Multiple concurrent refresh attempts (single-flight)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Scenario 7: Multiple concurrent refresh attempts (single-flight)', () => {
    it('AuthTransportManager.acquireRefreshedToken() — three concurrent calls produce exactly ONE network request and all receive the same token', async () => {
      let refreshNetworkCallCount = 0;
      let resolveRefresh!: (res: Response) => void;
      const pendingRefresh = new Promise<Response>((res) => {
        resolveRefresh = res;
      });

      fetchSpy.mockImplementation((url) => {
        if (extractUrl(url).includes('/api/v1/auth/refresh')) {
          refreshNetworkCallCount++;
          return pendingRefresh;
        }
        return Promise.resolve(createMockResponse({ status: 'ok' }, 200));
      });

      // Create a fresh manager and token store to avoid cross-test state pollution
      const freshTokenStore = new AuthTokenStore();
      const manager = new AuthTransportManager({
        // Custom endpoint so constructor uses our spy-intercepted URL
        refreshEndpoint: 'http://localhost/api/v1/auth/refresh',
        tokenStore: freshTokenStore,
      });

      // Fire three concurrent calls WITHOUT awaiting between them.
      // The single-flight guard (isRefreshing + refreshPromise) must ensure
      // only the first call triggers a network request; the others queue onto
      // the same promise.
      const promise1 = manager.acquireRefreshedToken();
      const promise2 = manager.acquireRefreshedToken();
      const promise3 = manager.acquireRefreshedToken();

      // Exactly ONE fetch call must have been made at this synchronous checkpoint
      expect(refreshNetworkCallCount).toBe(1);

      // Resolve the single pending network request
      resolveRefresh(
        createMockResponse({ accessToken: 'single-flight-shared-token', expiresIn: 900 }, 200),
      );

      // All three promises must resolve with the same token value
      const [token1, token2, token3] = await Promise.all([promise1, promise2, promise3]);

      expect(token1).toBe('single-flight-shared-token');
      expect(token2).toBe('single-flight-shared-token');
      expect(token3).toBe('single-flight-shared-token');

      // Network was hit exactly once — no refresh storm
      expect(refreshNetworkCallCount).toBe(1);

      // Token stored in the isolated store (not the global singleton)
      expect(freshTokenStore.getAccessToken()).toBe('single-flight-shared-token');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Scenario 8: Access token stored in memory only
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Scenario 8: Access token stored in memory only (never Web Storage)', () => {
    it('stores the access token exclusively in AuthTokenStore and never writes to localStorage or sessionStorage', async () => {
      const storageSetItemSpy = jest.spyOn(Storage.prototype, 'setItem');

      const Consumer: React.FC = () => {
        const { status } = useAuth();
        return <span data-testid="status">{status}</span>;
      };

      render(
        <TestWrapper>
          <Consumer />
        </TestWrapper>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('AUTHENTICATED');
      });

      // Token IS available in memory
      expect(authTokenStore.getAccessToken()).toBe(B12_ACCESS_TOKEN);

      // Token is NOT in localStorage
      expect(localStorage.getItem('accessToken')).toBeNull();
      expect(localStorage.getItem('token')).toBeNull();
      expect(localStorage.getItem('auth_token')).toBeNull();
      expect(localStorage.getItem('jwt')).toBeNull();

      // Token is NOT in sessionStorage
      expect(sessionStorage.getItem('accessToken')).toBeNull();
      expect(sessionStorage.getItem('token')).toBeNull();
      expect(sessionStorage.getItem('jwt')).toBeNull();

      // setItem was NEVER called with the actual token value
      const anyTokenWrittenToWebStorage = storageSetItemSpy.mock.calls.some(([, value]) => {
        return typeof value === 'string' && value === B12_ACCESS_TOKEN;
      });
      expect(anyTokenWrittenToWebStorage).toBe(false);

      storageSetItemSpy.mockRestore();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Scenario 9: Protected content hidden during bootstrap
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Scenario 9: Protected content remains hidden during bootstrap', () => {
    it('9a: renders a loading UI during bootstrap — no protected content, no premature redirect to /auth/login', async () => {
      let resolveRefresh!: (res: Response) => void;
      const pendingRefresh = new Promise<Response>((res) => {
        resolveRefresh = res;
      });
      fetchSpy.mockImplementationOnce(() => pendingRefresh);

      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <MemoryRouter initialEntries={['/dashboard']}>
            <AuthProvider>
              <Routes>
                <Route path="/auth/login" element={<div>Login Page</div>} />
                <Route element={<ProtectedRoute />}>
                  <Route path="/dashboard" element={<div>Dashboard Content</div>} />
                </Route>
              </Routes>
            </AuthProvider>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // During BOOTSTRAPPING: loading indicator must be visible
      expect(screen.getByText(/Verifying session authentication/i)).toBeInTheDocument();

      // Protected content and login page must NOT be shown during bootstrap
      expect(screen.queryByText('Dashboard Content')).not.toBeInTheDocument();
      expect(screen.queryByText('Login Page')).not.toBeInTheDocument();

      // Resolve bootstrap with a successful token
      await act(async () => {
        resolveRefresh(createMockResponse({ accessToken: B12_ACCESS_TOKEN }, 200));
      });

      // After AUTHENTICATED: protected content is revealed, no login redirect occurred
      await waitFor(() => {
        expect(screen.getByText('Dashboard Content')).toBeInTheDocument();
      });

      expect(screen.queryByText('Login Page')).not.toBeInTheDocument();
    });

    it('9b: redirects to /auth/login only AFTER bootstrap confirms the session is UNAUTHENTICATED', async () => {
      fetchSpy.mockImplementation((url) => {
        if (extractUrl(url).includes('/api/v1/auth/refresh')) {
          return Promise.resolve(
            createMockResponse({ message: 'No session', statusCode: 401 }, 401),
          );
        }
        return Promise.resolve(createMockResponse({}, 401));
      });

      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <MemoryRouter initialEntries={['/settings/profile']}>
            <AuthProvider>
              <Routes>
                <Route path="/auth/login" element={<div>Login Page</div>} />
                <Route element={<ProtectedRoute />}>
                  <Route path="/settings/profile" element={<div>Profile Settings</div>} />
                </Route>
              </Routes>
            </AuthProvider>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // After UNAUTHENTICATED: redirects to login with redirect query param
      await waitFor(() => {
        expect(screen.getByText('Login Page')).toBeInTheDocument();
      });

      // Protected content was never revealed
      expect(screen.queryByText('Profile Settings')).not.toBeInTheDocument();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Scenario 10: Successful transition to AUTHENTICATED
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Scenario 10: Successful full lifecycle transition to AUTHENTICATED', () => {
    it('completes BOOTSTRAPPING → AUTHENTICATED with correct user data from backend (not JWT-decoded)', async () => {
      const capturedStatuses: string[] = [];

      const LifecycleConsumer: React.FC = () => {
        const { status, currentUser, isAuthenticated, isBootstrapping } = useAuth();

        React.useEffect(() => {
          capturedStatuses.push(status);
        }, [status]);

        return (
          <div>
            <span data-testid="status">{status}</span>
            <span data-testid="is-authenticated">{String(isAuthenticated)}</span>
            <span data-testid="is-bootstrapping">{String(isBootstrapping)}</span>
            <span data-testid="user-id">{currentUser?.id ?? 'null'}</span>
            <span data-testid="user-email">{currentUser?.email ?? 'null'}</span>
            <span data-testid="user-tenant">{currentUser?.tenantId ?? 'null'}</span>
            <span data-testid="user-roles">{currentUser?.roles.join(',') ?? 'null'}</span>
            <span data-testid="user-perms">{currentUser?.permissions.join(',') ?? 'null'}</span>
          </div>
        );
      };

      render(
        <TestWrapper>
          <LifecycleConsumer />
        </TestWrapper>,
      );

      // Phase 1: BOOTSTRAPPING
      expect(screen.getByTestId('status')).toHaveTextContent('BOOTSTRAPPING');
      expect(screen.getByTestId('is-bootstrapping')).toHaveTextContent('true');
      expect(screen.getByTestId('is-authenticated')).toHaveTextContent('false');
      expect(screen.getByTestId('user-id')).toHaveTextContent('null');

      // Phase 2: AUTHENTICATED
      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('AUTHENTICATED');
      });

      expect(screen.getByTestId('is-authenticated')).toHaveTextContent('true');
      expect(screen.getByTestId('is-bootstrapping')).toHaveTextContent('false');

      // User data sourced from /me endpoint (backend), not JWT payload
      expect(screen.getByTestId('user-id')).toHaveTextContent(B12_USER.id);
      expect(screen.getByTestId('user-email')).toHaveTextContent(B12_USER.email);
      expect(screen.getByTestId('user-tenant')).toHaveTextContent(B12_USER.tenantId!);
      expect(screen.getByTestId('user-roles')).toHaveTextContent('OPERATOR');
      expect(screen.getByTestId('user-perms')).toHaveTextContent('client:read,energy:read');

      // Access token is in memory
      expect(authTokenStore.getAccessToken()).toBe(B12_ACCESS_TOKEN);

      // Status machine traversed the correct sequence
      expect(capturedStatuses).toContain('BOOTSTRAPPING');
      expect(capturedStatuses).toContain('AUTHENTICATED');

      // Verify backend /me endpoint was called (user data is NOT JWT-decoded)
      const fetchCalls = fetchSpy.mock.calls.map(([url]) => extractUrl(url));
      expect(fetchCalls.some((u) => u.includes('/auth/me'))).toBe(true);
    });
  });
});
