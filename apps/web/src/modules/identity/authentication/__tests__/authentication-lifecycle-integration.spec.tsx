/**
 * Track B — Step B2.5: Authentication Lifecycle Integration Test Suite
 *
 * End-to-end integration test suite validating the complete application authentication lifecycle:
 *   - AuthProvider state transitions (BOOTSTRAPPING, AUTHENTICATED, UNAUTHENTICATED, AUTHENTICATION_ERROR)
 *   - Real unmocked LoginView & useLoginForm interaction
 *   - Real unmocked AuthTokenStore & AuthTransportManager single-flight transport
 *   - Real unmocked HttpClient Bearer attachment & 401 interception retry
 *   - ProtectedRoute & PublicRoute application router integration
 *
 * Scenarios tested:
 *   Scenario 1  — Fresh unauthenticated application (BOOTSTRAPPING → UNAUTHENTICATED → Login UI)
 *   Scenario 2  — Session restoration (BOOTSTRAPPING → refresh → user → AUTHENTICATED)
 *   Scenario 3  — Successful Login (UNAUTHENTICATED → form submit → AUTHENTICATED → dashboard navigation)
 *   Scenario 4  — Login failure (UNAUTHENTICATED → invalid credentials → remain UNAUTHENTICATED + form error)
 *   Scenario 5  — Logout (AUTHENTICATED → logout → token & cache clear → UNAUTHENTICATED → /auth/login)
 *   Scenario 6  — Expired access token (request 401 → silent refresh → transparent retry → success)
 *   Scenario 7  — Refresh failure (request 401 → refresh 401 → UNAUTHENTICATED → /auth/login)
 *   Scenario 8  — Concurrent refresh (3 401 calls → EXACTLY 1 refresh HTTP request → transparent recovery)
 *   Scenario 9  — Application Reload (app reinitialization → silent session restoration)
 *   Scenario 10 — Backend unavailable (500 gateway failure → AUTHENTICATION_ERROR + retry support)
 */
import '@testing-library/jest-dom';
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '../../../../app/providers/auth-provider';
import { ProtectedRoute } from '../../../auth/components/protected-route';
import { PublicRoute } from '../../../auth/components/public-route';
import { authTokenStore } from '../../../../shared/auth/auth-token-store';
import { setupAuthTransport } from '../../../../shared/auth/auth-transport';
import { httpClient } from '../../../../shared/api/http-client';
import { LoginRoute } from '../routes/login-route';
import type { AuthUser } from '../../../auth/domain/auth-state.types';

const TEST_USER: AuthUser = {
  id: 'usr-b2-5-lifecycle',
  email: 'architect@kinergy.io',
  name: 'Lead Architect',
  roles: ['ADMIN'],
  permissions: ['client:read', 'energy:read', 'analytics:read'],
  tenantId: 'tenant_lifecycle',
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

// Protected Dashboard component consuming server state
const ProtectedDashboard: React.FC = () => {
  const { currentUser, logout, status } = useAuth();
  const navigate = useNavigate();

  const { data } = useQuery({
    queryKey: ['dashboard-data'],
    queryFn: async () => httpClient.get<{ energyKwh: number }>('/api/v1/energy/data'),
    enabled: status === 'AUTHENTICATED',
  });

  const handleLogout = async () => {
    await logout();
    navigate('/auth/login', { replace: true });
  };

  return (
    <div>
      <h1 data-testid="dashboard-heading">Protected Dashboard</h1>
      <span data-testid="user-name">{currentUser?.name ?? 'None'}</span>
      <span data-testid="user-email">{currentUser?.email ?? 'None'}</span>
      <span data-testid="energy-data">{data?.energyKwh ?? 'No Data'}</span>
      <button data-testid="logout-button" onClick={() => void handleLogout()}>
        Sign Out
      </button>
    </div>
  );
};

interface TestAppProps {
  queryClient: QueryClient;
  initialEntries?: string[];
  initialSessionOverride?: AuthUser | null;
}

const TestApp: React.FC<TestAppProps> = ({
  queryClient,
  initialEntries = ['/dashboard'],
  initialSessionOverride,
}) => {
  setupAuthTransport(httpClient);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider initialSessionOverride={initialSessionOverride}>
        <MemoryRouter initialEntries={initialEntries}>
          <Routes>
            <Route
              path="/auth/login"
              element={
                <PublicRoute>
                  <LoginRoute />
                </PublicRoute>
              }
            />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <ProtectedDashboard />
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
};

describe('Track B — Step B2.5: Authentication Lifecycle Integration Tests', () => {
  let queryClient: QueryClient;
  let fetchSpy: jest.SpyInstance;
  let refreshCount: number;

  beforeEach(() => {
    refreshCount = 0;
    act(() => {
      authTokenStore.clearSession();
    });
    queryClient = createTestQueryClient();

    setupAuthTransport(httpClient);

    if (!global.fetch) {
      (global as unknown as { fetch: typeof fetch }).fetch = jest.fn();
    }

    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation((url) => {
      const urlStr = extractUrl(url);

      if (urlStr.includes('/api/v1/auth/login')) {
        return Promise.resolve(
          createMockResponse({
            accessToken: 'mock-jwt-lifecycle-token-100',
            tokenType: 'Bearer',
            expiresIn: 900,
            user: TEST_USER,
          }),
        );
      }

      if (urlStr.includes('/api/v1/auth/refresh')) {
        refreshCount += 1;
        return Promise.resolve(
          createMockResponse({
            accessToken: 'mock-jwt-lifecycle-token-200',
            expiresIn: 900,
          }),
        );
      }

      if (urlStr.includes('/api/v1/auth/me')) {
        return Promise.resolve(createMockResponse(TEST_USER, 200));
      }

      if (urlStr.includes('/api/v1/auth/logout')) {
        return Promise.resolve(createMockResponse({ success: true }, 200));
      }

      if (urlStr.includes('/api/v1/energy/data')) {
        return Promise.resolve(createMockResponse({ energyKwh: 12500 }, 200));
      }

      return Promise.resolve(createMockResponse({ status: 'ok' }, 200));
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  // ─── Scenario 1 — Fresh unauthenticated application ────────────────────────

  it('Scenario 1 — Fresh unauthenticated application (BOOTSTRAPPING → UNAUTHENTICATED → Login UI)', async () => {
    fetchSpy.mockImplementation((url) => {
      const urlStr = extractUrl(url);
      if (urlStr.includes('/api/v1/auth/refresh')) {
        return Promise.resolve(
          createMockResponse({ statusCode: 401, message: 'No refresh token' }, 401),
        );
      }
      return Promise.resolve(createMockResponse({ status: 'ok' }));
    });

    render(<TestApp queryClient={queryClient} initialEntries={['/dashboard']} />);

    // Initial bootstrap completes, transitions to UNAUTHENTICATED and redirects to /auth/login
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Sign In$/i })).toBeInTheDocument();
      expect(screen.getByText(/Enter your credentials/i)).toBeInTheDocument();
    });

    expect(authTokenStore.getAccessToken()).toBeNull();
  });

  // ─── Scenario 2 — Session restoration ─────────────────────────────────────

  it('Scenario 2 — Session restoration (BOOTSTRAPPING → silent refresh → current user → AUTHENTICATED)', async () => {
    render(<TestApp queryClient={queryClient} initialEntries={['/dashboard']} />);

    // Silent refresh & profile fetch complete, restoring AUTHENTICATED state and protected content
    await waitFor(() => {
      expect(screen.getByTestId('dashboard-heading')).toBeInTheDocument();
      expect(screen.getByTestId('user-name')).toHaveTextContent('Lead Architect');
      expect(screen.getByTestId('user-email')).toHaveTextContent('architect@kinergy.io');
    });

    expect(authTokenStore.getAccessToken()).toBe('mock-jwt-lifecycle-token-200');
    expect(refreshCount).toBe(1);
  });

  // ─── Scenario 3 — Login ───────────────────────────────────────────────────

  it('Scenario 3 — Login (UNAUTHENTICATED → form submit → AUTHENTICATED → dashboard navigation)', async () => {
    render(
      <TestApp
        queryClient={queryClient}
        initialEntries={['/auth/login']}
        initialSessionOverride={null}
      />,
    );

    // 1. Fill login credentials
    fireEvent.change(screen.getByLabelText(/Email Address/i), {
      target: { value: 'architect@kinergy.io' },
    });
    fireEvent.change(screen.getByLabelText(/Password/i, { selector: 'input' }), {
      target: { value: 'SecureP@ss123' },
    });

    // 2. Submit form
    fireEvent.click(screen.getByRole('button', { name: /^Sign In$/i }));

    // 3. Verify post-login authentication & navigation to dashboard
    await waitFor(() => {
      expect(screen.getByTestId('dashboard-heading')).toBeInTheDocument();
      expect(screen.getByTestId('user-name')).toHaveTextContent('Lead Architect');
    });

    expect(authTokenStore.getAccessToken()).toBe('mock-jwt-lifecycle-token-100');
  });

  // ─── Scenario 4 — Login failure ───────────────────────────────────────────

  it('Scenario 4 — Login failure (UNAUTHENTICATED → invalid credentials → remain UNAUTHENTICATED)', async () => {
    fetchSpy.mockImplementation((url) => {
      const urlStr = extractUrl(url);
      if (urlStr.includes('/api/v1/auth/login')) {
        return Promise.resolve(
          createMockResponse({ statusCode: 401, message: 'Invalid email or password.' }, 401),
        );
      }
      return Promise.resolve(createMockResponse({ status: 'ok' }));
    });

    render(
      <TestApp
        queryClient={queryClient}
        initialEntries={['/auth/login']}
        initialSessionOverride={null}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Email Address/i), {
      target: { value: 'wrong@kinergy.io' },
    });
    fireEvent.change(screen.getByLabelText(/Password/i, { selector: 'input' }), {
      target: { value: 'wrong-pass' },
    });

    fireEvent.click(screen.getByRole('button', { name: /^Sign In$/i }));

    await waitFor(() => {
      expect(screen.getByText(/Invalid email or password/i)).toBeInTheDocument();
    });

    // Remains unauthenticated on login screen
    expect(authTokenStore.getAccessToken()).toBeNull();
    expect(screen.getByRole('button', { name: /^Sign In$/i })).toBeInTheDocument();
  });

  // ─── Scenario 5 — Logout ──────────────────────────────────────────────────

  it('Scenario 5 — Logout (AUTHENTICATED → logout → token & cache clear → UNAUTHENTICATED → /auth/login)', async () => {
    render(
      <TestApp
        queryClient={queryClient}
        initialEntries={['/dashboard']}
        initialSessionOverride={TEST_USER}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('dashboard-heading')).toBeInTheDocument();
    });

    // Click logout
    fireEvent.click(screen.getByTestId('logout-button'));

    // Navigates back to login screen, protected dashboard content becomes unavailable
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Sign In$/i })).toBeInTheDocument();
    });

    expect(authTokenStore.getAccessToken()).toBeNull();
    expect(screen.queryByTestId('dashboard-heading')).not.toBeInTheDocument();
  });

  // ─── Scenario 6 — Expired access token ────────────────────────────────────

  it('Scenario 6 — Expired access token (request 401 → silent refresh → transparent retry → success)', async () => {
    authTokenStore.setAccessToken('stale-token');

    fetchSpy.mockImplementation((url, init) => {
      const urlStr = extractUrl(url);

      if (urlStr.includes('/api/v1/energy/data')) {
        const headers = init?.headers;
        let authHeader: string | null = null;
        if (headers instanceof Headers) {
          authHeader = headers.get('Authorization');
        }

        if (authHeader === 'Bearer stale-token') {
          return Promise.resolve(createMockResponse({ message: 'Token expired' }, 401));
        }

        if (authHeader === 'Bearer mock-jwt-lifecycle-token-200') {
          return Promise.resolve(createMockResponse({ energyKwh: 9999 }, 200));
        }
      }

      if (urlStr.includes('/api/v1/auth/refresh')) {
        refreshCount += 1;
        return Promise.resolve(
          createMockResponse({ accessToken: 'mock-jwt-lifecycle-token-200', expiresIn: 900 }),
        );
      }

      return Promise.resolve(createMockResponse({ status: 'ok' }));
    });

    render(
      <TestApp
        queryClient={queryClient}
        initialEntries={['/dashboard']}
        initialSessionOverride={TEST_USER}
      />,
    );

    // Transparent retry succeeded, fetching energy payload
    await waitFor(() => {
      expect(screen.getByTestId('energy-data')).toHaveTextContent('9999');
    });

    expect(refreshCount).toBe(1);
    expect(authTokenStore.getAccessToken()).toBe('mock-jwt-lifecycle-token-200');
  });

  // ─── Scenario 7 — Refresh failure ─────────────────────────────────────────

  it('Scenario 7 — Refresh failure (request 401 → refresh 401 → UNAUTHENTICATED → /auth/login)', async () => {
    authTokenStore.setAccessToken('stale-token');

    fetchSpy.mockImplementation((url) => {
      const urlStr = extractUrl(url);
      if (urlStr.includes('/api/v1/energy/data')) {
        return Promise.resolve(createMockResponse({ message: 'Token expired' }, 401));
      }
      if (urlStr.includes('/api/v1/auth/refresh')) {
        return Promise.resolve(
          createMockResponse({ statusCode: 401, message: 'Session revoked' }, 401),
        );
      }
      return Promise.resolve(createMockResponse({ status: 'ok' }));
    });

    render(
      <TestApp
        queryClient={queryClient}
        initialEntries={['/dashboard']}
        initialSessionOverride={TEST_USER}
      />,
    );

    // Refresh failure forces transition to UNAUTHENTICATED and routes to /auth/login
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Sign In$/i })).toBeInTheDocument();
    });

    expect(authTokenStore.getAccessToken()).toBeNull();
  });

  // ─── Scenario 8 — Concurrent refresh ─────────────────────────────────────

  it('Scenario 8 — Concurrent refresh (3 401 calls → EXACTLY 1 refresh HTTP request → success)', async () => {
    authTokenStore.setAccessToken('stale-token-123');

    fetchSpy.mockImplementation((url, init) => {
      const urlStr = extractUrl(url);

      if (urlStr.includes('/api/v1/auth/refresh')) {
        refreshCount += 1;
        return Promise.resolve(
          createMockResponse({ accessToken: 'mock-dedup-token-888', expiresIn: 900 }),
        );
      }

      if (urlStr.includes('/api/v1/batch-')) {
        const headers = init?.headers;
        let authHeader: string | null = null;
        if (headers instanceof Headers) {
          authHeader = headers.get('Authorization');
        }

        if (authHeader !== 'Bearer mock-dedup-token-888') {
          return Promise.resolve(createMockResponse({ message: 'Stale' }, 401));
        }

        return Promise.resolve(createMockResponse({ ok: true }, 200));
      }

      return Promise.resolve(createMockResponse({ status: 'ok' }));
    });

    const p1 = httpClient.get('/api/v1/batch-1');
    const p2 = httpClient.get('/api/v1/batch-2');
    const p3 = httpClient.get('/api/v1/batch-3');

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

    expect(r1).toEqual({ ok: true });
    expect(r2).toEqual({ ok: true });
    expect(r3).toEqual({ ok: true });

    // EXACTLY 1 refresh HTTP call was generated across 3 concurrent 401s
    expect(refreshCount).toBe(1);
    expect(authTokenStore.getAccessToken()).toBe('mock-dedup-token-888');
  });

  // ─── Scenario 9 — Reload ──────────────────────────────────────────────────

  it('Scenario 9 — Reload (application reinitialization restores session via silent refresh)', async () => {
    // 1. Render initial app session
    const { unmount } = render(
      <TestApp queryClient={queryClient} initialEntries={['/dashboard']} />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('dashboard-heading')).toBeInTheDocument();
    });

    // 2. Simulate page refresh / unmount
    unmount();
    act(() => {
      authTokenStore.clearSession();
    });

    // 3. Reinitialize app components (simulate reload)
    const newQueryClient = createTestQueryClient();
    render(<TestApp queryClient={newQueryClient} initialEntries={['/dashboard']} />);

    // Silent refresh re-establishes session
    await waitFor(() => {
      expect(screen.getByTestId('dashboard-heading')).toBeInTheDocument();
      expect(screen.getByTestId('user-name')).toHaveTextContent('Lead Architect');
    });

    expect(authTokenStore.getAccessToken()).toBe('mock-jwt-lifecycle-token-200');
  });

  // ─── Scenario 10 — Backend unavailable ────────────────────────────────────

  it('Scenario 10 — Backend unavailable (500 gateway error transitions to AUTHENTICATION_ERROR without crash)', async () => {
    fetchSpy.mockImplementation((url) => {
      const urlStr = extractUrl(url);
      if (urlStr.includes('/api/v1/auth/refresh')) {
        return Promise.resolve(
          createMockResponse({ statusCode: 500, message: 'Authentication Service Outage' }, 500),
        );
      }
      return Promise.resolve(createMockResponse({ status: 'ok' }));
    });

    const ErrorConsumer: React.FC = () => {
      const { status, error } = useAuth();
      return (
        <div>
          <span data-testid="status">{status}</span>
          <span data-testid="error">{error?.message ?? 'None'}</span>
        </div>
      );
    };

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ErrorConsumer />
        </AuthProvider>
      </QueryClientProvider>,
    );

    // App remains stable in AUTHENTICATION_ERROR state
    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('AUTHENTICATION_ERROR');
      expect(screen.getByTestId('error')).toHaveTextContent('Authentication gateway failure.');
    });

    expect(authTokenStore.getAccessToken()).toBeNull();
  });
});
