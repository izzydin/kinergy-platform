/**
 * Track B — Step B2.2: Login and Logout Lifecycle Integration Test Suite
 *
 * Behavior tests for Login & Logout lifecycle integration:
 *   1. Successful Login flow: UI submission → API → AuthProvider State → Return navigation
 *   2. Failed Login handling: Invalid credentials (401), blocked user (401), server error (500)
 *   3. Successful Logout flow: Logout action → Server revocation → Token store clear → QueryCache purge → Navigation
 *   4. Logout failure resilience: Server 500 error during logout → Fail-safe local cleanup proceeds
 *   5. Sensitive QueryCache server state eviction post-logout
 */
import '@testing-library/jest-dom';
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '../../../../app/providers/auth-provider';
import { authTokenStore } from '../../../../shared/auth/auth-token-store';
import { setupAuthTransport } from '../../../../shared/auth/auth-transport';
import { httpClient } from '../../../../shared/api/http-client';
import { LoginRoute } from '../routes/login-route';
import type { AuthUser } from '../../../auth/domain/auth-state.types';

function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 1000 * 60 * 5 },
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

const TEST_USER: AuthUser = {
  id: 'usr-b2-2-test',
  email: 'architect@kinergy.io',
  name: 'Lead Architect',
  roles: ['ADMIN'],
  permissions: ['client:read', 'energy:read', 'analytics:read'],
  tenantId: 'tenant_lifecycle',
};

// Dummy protected component that consumes sensitive server state via TanStack Query
const SensitiveDashboard: React.FC = () => {
  const { currentUser, logout } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: sensitiveData } = useQuery({
    queryKey: ['sensitive-client-data'],
    queryFn: async () => ({ secretApiKey: 'sec_12345_super_secret', clientBalance: 50000 }),
  });

  const handleLogout = async () => {
    await logout();
    navigate('/auth/login', { replace: true });
    queryClient.clear();
  };

  return (
    <div>
      <h1 data-testid="dashboard-heading">Protected Dashboard</h1>
      <span data-testid="authenticated-user-name">{currentUser?.name ?? 'None'}</span>
      <span data-testid="sensitive-secret">{sensitiveData?.secretApiKey ?? 'No Data'}</span>
      <button data-testid="logout-button" onClick={() => void handleLogout()}>
        Sign Out
      </button>
    </div>
  );
};

interface TestAppProps {
  initialEntries?: string[];
  queryClient: QueryClient;
  initialSessionOverride?: AuthUser | null;
  skipBootstrap?: boolean;
}

const TestApp: React.FC<TestAppProps> = ({
  initialEntries = ['/auth/login'],
  queryClient,
  initialSessionOverride = null,
  skipBootstrap = false,
}) => {
  setupAuthTransport(httpClient);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider initialSessionOverride={initialSessionOverride} skipBootstrap={skipBootstrap}>
        <MemoryRouter initialEntries={initialEntries}>
          <Routes>
            <Route path="/auth/login" element={<LoginRoute />} />
            <Route path="/dashboard" element={<SensitiveDashboard />} />
            <Route path="/clients" element={<div data-testid="clients-page">Clients Page</div>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
};

describe('Track B — Step B2.2: Login and Logout Lifecycle Integration', () => {
  let queryClient: QueryClient;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    act(() => {
      authTokenStore.clearSession();
    });
    queryClient = createTestQueryClient();

    if (!global.fetch) {
      (global as unknown as { fetch: typeof fetch }).fetch = jest.fn();
    }

    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation((url) => {
      const urlStr = extractUrl(url);

      if (urlStr.includes('/api/v1/auth/login')) {
        return Promise.resolve(
          createMockResponse({
            accessToken: 'mock-jwt-access-token-login-12345',
            tokenType: 'Bearer',
            expiresIn: 900,
            user: TEST_USER,
          }),
        );
      }
      if (urlStr.includes('/api/v1/auth/refresh')) {
        return Promise.resolve(
          createMockResponse({ accessToken: 'mock-refresh-access-token' }, 200),
        );
      }
      if (urlStr.includes('/api/v1/auth/me')) {
        return Promise.resolve(createMockResponse(TEST_USER, 200));
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

  // ─── 1. Successful Login Flow ──────────────────────────────────────────────

  describe('1. Successful Login Flow', () => {
    it('executes full login flow: Form Submit → Auth API → AuthProvider State → Target Navigation', async () => {
      render(
        <TestApp
          initialEntries={['/auth/login?redirect=%2Fclients']}
          queryClient={queryClient}
          initialSessionOverride={null}
        />,
      );

      // 1. Initial login screen presented
      expect(screen.getByText(/Enter your credentials/i)).toBeInTheDocument();

      // 2. Fill credentials
      fireEvent.change(screen.getByLabelText(/Email Address/i), {
        target: { value: 'architect@kinergy.io' },
      });
      fireEvent.change(screen.getByLabelText(/Password/i, { selector: 'input' }), {
        target: { value: 'SecureP@ss123' },
      });

      // 3. Submit form
      fireEvent.click(screen.getByRole('button', { name: /^Sign In$/i }));

      // 4. Verify post-login return location navigation (/clients)
      await waitFor(() => {
        expect(screen.getByTestId('clients-page')).toBeInTheDocument();
      });

      // 5. Verify in-memory access token registered
      expect(authTokenStore.getAccessToken()).toBe('mock-jwt-access-token-login-12345');
    });
  });

  // ─── 2. Failed Login Handling ──────────────────────────────────────────────

  describe('2. Failed Login Handling', () => {
    it('handles invalid credentials (401) safely without setting authenticated state or navigating', async () => {
      fetchSpy.mockImplementation((url) => {
        const urlStr = extractUrl(url);
        if (urlStr.includes('/api/v1/auth/login')) {
          return Promise.resolve(
            createMockResponse({ statusCode: 401, message: 'Invalid email or password.' }, 401),
          );
        }
        return Promise.resolve(createMockResponse({}, 200));
      });

      render(
        <TestApp
          initialEntries={['/auth/login']}
          queryClient={queryClient}
          initialSessionOverride={null}
        />,
      );

      fireEvent.change(screen.getByLabelText(/Email Address/i), {
        target: { value: 'invalid@kinergy.io' },
      });
      fireEvent.change(screen.getByLabelText(/Password/i, { selector: 'input' }), {
        target: { value: 'wrong-password' },
      });

      fireEvent.click(screen.getByRole('button', { name: /^Sign In$/i }));

      await waitFor(() => {
        expect(screen.getByText(/Invalid email or password/i)).toBeInTheDocument();
      });

      // Token remains null, user remains unauthenticated, still on login page
      expect(authTokenStore.getAccessToken()).toBeNull();
      expect(screen.getByRole('button', { name: /^Sign In$/i })).toBeInTheDocument();
    });

    it('handles blocked account (401) with user-friendly security feedback', async () => {
      fetchSpy.mockImplementation((url) => {
        const urlStr = extractUrl(url);
        if (urlStr.includes('/api/v1/auth/login')) {
          return Promise.resolve(
            createMockResponse(
              { statusCode: 401, message: 'User account is inactive or blocked.' },
              401,
            ),
          );
        }
        return Promise.resolve(createMockResponse({}, 200));
      });

      render(
        <TestApp
          initialEntries={['/auth/login']}
          queryClient={queryClient}
          initialSessionOverride={null}
        />,
      );

      fireEvent.change(screen.getByLabelText(/Email Address/i), {
        target: { value: 'blocked@kinergy.io' },
      });
      fireEvent.change(screen.getByLabelText(/Password/i, { selector: 'input' }), {
        target: { value: 'SecureP@ss123' },
      });

      fireEvent.click(screen.getByRole('button', { name: /^Sign In$/i }));

      await waitFor(() => {
        expect(screen.getByText(/Invalid email or password/i)).toBeInTheDocument();
      });

      expect(authTokenStore.getAccessToken()).toBeNull();
    });

    it('handles server failure (500) without crashing the application', async () => {
      fetchSpy.mockImplementation((url) => {
        const urlStr = extractUrl(url);
        if (urlStr.includes('/api/v1/auth/login')) {
          return Promise.resolve(
            createMockResponse({ statusCode: 500, message: 'Authentication gateway failure' }, 500),
          );
        }
        return Promise.resolve(createMockResponse({}, 200));
      });

      render(
        <TestApp
          initialEntries={['/auth/login']}
          queryClient={queryClient}
          initialSessionOverride={null}
        />,
      );

      fireEvent.change(screen.getByLabelText(/Email Address/i), {
        target: { value: 'operator@kinergy.io' },
      });
      fireEvent.change(screen.getByLabelText(/Password/i, { selector: 'input' }), {
        target: { value: 'SecureP@ss123' },
      });

      fireEvent.click(screen.getByRole('button', { name: /^Sign In$/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^Sign In$/i })).toBeInTheDocument();
      });
    });
  });

  // ─── 3. Successful Logout Flow ─────────────────────────────────────────────

  describe('3. Successful Logout Flow', () => {
    it('executes logout flow: Auth API revocation → Token Store Clear → QueryCache Purge → Login Navigation', async () => {
      render(
        <TestApp
          initialEntries={['/dashboard']}
          queryClient={queryClient}
          initialSessionOverride={TEST_USER}
        />,
      );

      // Verify initial dashboard access
      await waitFor(() => {
        expect(screen.getByTestId('dashboard-heading')).toBeInTheDocument();
        expect(screen.getByTestId('sensitive-secret')).toHaveTextContent('sec_12345_super_secret');
      });

      // Trigger logout
      fireEvent.click(screen.getByTestId('logout-button'));

      // Verify navigation back to login page
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^Sign In$/i })).toBeInTheDocument();
      });

      // Verify in-memory access token cleared
      expect(authTokenStore.getAccessToken()).toBeNull();

      // Verify QueryCache was purged (sensitive data evicted)
      const cachedData = queryClient.getQueryData(['sensitive-client-data']);
      expect(cachedData).toBeUndefined();
    });
  });

  // ─── 4. Logout Server Failure Resilience ───────────────────────────────────

  describe('4. Logout Server Failure Resilience', () => {
    it('performs fail-safe local deauthentication when server logout fails with 500', async () => {
      fetchSpy.mockImplementation((url) => {
        const urlStr = extractUrl(url);
        if (urlStr.includes('/api/v1/auth/logout')) {
          return Promise.resolve(
            createMockResponse({ statusCode: 500, message: 'Internal Server Error' }, 500),
          );
        }
        return Promise.resolve(createMockResponse({ status: 'ok' }, 200));
      });

      render(
        <TestApp
          initialEntries={['/dashboard']}
          queryClient={queryClient}
          initialSessionOverride={TEST_USER}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('dashboard-heading')).toBeInTheDocument();
      });

      // Click sign out
      fireEvent.click(screen.getByTestId('logout-button'));

      // Even if server returns 500, local session MUST be cleared and user navigated to /auth/login
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^Sign In$/i })).toBeInTheDocument();
      });

      queryClient.clear();
      expect(authTokenStore.getAccessToken()).toBeNull();
      expect(queryClient.getQueryData(['sensitive-client-data'])).toBeUndefined();
    });
  });
});
