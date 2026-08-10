import '@testing-library/jest-dom';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '../../../app/providers/auth-provider';

import { ProtectedRoute } from '../components/protected-route';
import { PublicRoute } from '../components/public-route';
import { authTokenStore } from '../../../shared/auth/auth-token-store';
import { setupAuthTransport } from '../../../shared/auth/auth-transport';
import { httpClient } from '../../../shared/api/http-client';
import type { UserSession } from '../domain/auth-state.types';

function createTestQueryClient() {
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

const TEST_USER: UserSession = {
  id: 'usr-b1-test',
  email: 'architect@kinergy.io',
  name: 'Lead Architect',
  roles: ['ADMIN'],
  permissions: ['client:read', 'energy:read', 'analytics:read'],
  tenantId: 'tenant_test',
};

describe('Track B — Milestone B1.0: Auth Bootstrap & Session Recovery Suite', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
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
        return Promise.resolve(
          createMockResponse({ accessToken: 'mock-b1-access-token', expiresIn: 900 }, 200),
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

  describe('1. Authentication State Machine & Silent Refresh Bootstrap', () => {
    it('executes silent refresh on mount, stores memory token, and transitions to AUTHENTICATED', async () => {
      const TestConsumer: React.FC = () => {
        const { status, session, isAuthenticated } = useAuth();
        return (
          <div>
            <span data-testid="auth-status">{status}</span>
            <span data-testid="auth-user">{session?.name || 'none'}</span>
            <span data-testid="is-authenticated">{String(isAuthenticated)}</span>
          </div>
        );
      };

      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <AuthProvider>
            <TestConsumer />
          </AuthProvider>
        </QueryClientProvider>,
      );

      // Verify immediate bootstrapping state
      expect(screen.getByTestId('auth-status')).toHaveTextContent('BOOTSTRAPPING');

      // Wait for silent refresh & user profile fetch to complete
      await waitFor(() => {
        expect(screen.getByTestId('auth-status')).toHaveTextContent('AUTHENTICATED');
      });

      expect(screen.getByTestId('auth-user')).toHaveTextContent('Lead Architect');
      expect(screen.getByTestId('is-authenticated')).toHaveTextContent('true');
      expect(authTokenStore.getAccessToken()).toBe('mock-b1-access-token');
    });

    it('transitions to UNAUTHENTICATED and clears memory tokens when silent refresh fails with 401', async () => {
      fetchSpy.mockImplementation((url) => {
        const urlStr = extractUrl(url);
        if (urlStr.includes('/api/v1/auth/refresh')) {
          return Promise.resolve(createMockResponse({ message: 'Refresh token expired' }, 401));
        }
        return Promise.resolve(createMockResponse({}, 401));
      });

      const TestConsumer: React.FC = () => {
        const { status, isUnauthenticated } = useAuth();
        return (
          <div>
            <span data-testid="auth-status">{status}</span>
            <span data-testid="is-unauthenticated">{String(isUnauthenticated)}</span>
          </div>
        );
      };

      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <AuthProvider>
            <TestConsumer />
          </AuthProvider>
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('auth-status')).toHaveTextContent('UNAUTHENTICATED');
      });

      expect(screen.getByTestId('is-unauthenticated')).toHaveTextContent('true');
      expect(authTokenStore.getAccessToken()).toBeNull();
    });
  });

  describe('2. Protected Route Guard Behavior', () => {
    it('renders loading UI during BOOTSTRAPPING without prematurely redirecting to /auth/login', async () => {
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
                <Route path="/auth/login" element={<div>Login Screen</div>} />
                <Route element={<ProtectedRoute />}>
                  <Route path="/dashboard" element={<div>Protected Dashboard Content</div>} />
                </Route>
              </Routes>
            </AuthProvider>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Verify loading fallback is rendered and NO redirect occurred
      expect(screen.getByText(/Verifying session authentication.../i)).toBeInTheDocument();
      expect(screen.queryByText('Login Screen')).not.toBeInTheDocument();

      // Resolve pending refresh response
      await act(async () => {
        resolveRefresh(createMockResponse({ accessToken: 'token-after-delay' }, 200));
      });

      // Verify transition to protected dashboard view
      await waitFor(() => {
        expect(screen.getByText('Protected Dashboard Content')).toBeInTheDocument();
      });
    });

    it('redirects to /auth/login?redirect=... when status is UNAUTHENTICATED', async () => {
      fetchSpy.mockImplementation((url) => {
        const urlStr = extractUrl(url);
        if (urlStr.includes('/api/v1/auth/refresh')) {
          return Promise.resolve(createMockResponse({ message: 'No refresh token' }, 401));
        }
        return Promise.resolve(createMockResponse({}, 401));
      });

      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <MemoryRouter initialEntries={['/protected/settings']}>
            <AuthProvider>
              <Routes>
                <Route path="/auth/login" element={<div>Login Screen Entry Point</div>} />
                <Route element={<ProtectedRoute />}>
                  <Route path="/protected/settings" element={<div>Protected Settings</div>} />
                </Route>
              </Routes>
            </AuthProvider>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText('Login Screen Entry Point')).toBeInTheDocument();
      });

      expect(screen.queryByText('Protected Settings')).not.toBeInTheDocument();
    });

    it('checks requiredPermissions and renders ForbiddenView (403) when user lacks permissions', async () => {
      const RESTRICTED_USER: UserSession = {
        ...TEST_USER,
        permissions: ['client:read'], // Lacks admin:read
      };

      fetchSpy.mockImplementation((url) => {
        const urlStr = extractUrl(url);
        if (urlStr.includes('/api/v1/auth/refresh')) {
          return Promise.resolve(createMockResponse({ accessToken: 'valid-token' }, 200));
        }
        if (urlStr.includes('/api/v1/auth/me')) {
          return Promise.resolve(createMockResponse(RESTRICTED_USER, 200));
        }
        return Promise.resolve(createMockResponse({}, 200));
      });

      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <MemoryRouter initialEntries={['/admin']}>
            <AuthProvider>
              <Routes>
                <Route element={<ProtectedRoute requiredPermissions={['admin:read']} />}>
                  <Route path="/admin" element={<div>Admin Panel View</div>} />
                </Route>
              </Routes>
            </AuthProvider>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /Access Denied/i })).toBeInTheDocument();
      });

      expect(screen.queryByText('Admin Panel View')).not.toBeInTheDocument();
    });
  });

  describe('3. Public Route Guard Behavior', () => {
    it('redirects authenticated users away from /auth/login to default redirect path', async () => {
      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <MemoryRouter initialEntries={['/auth/login']}>
            <AuthProvider>
              <Routes>
                <Route element={<PublicRoute />}>
                  <Route path="/auth/login" element={<div>Public Login Form</div>} />
                </Route>
                <Route path="/dashboard" element={<div>Dashboard Overview View</div>} />
              </Routes>
            </AuthProvider>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText('Dashboard Overview View')).toBeInTheDocument();
      });

      expect(screen.queryByText('Public Login Form')).not.toBeInTheDocument();
    });
  });

  describe('4. Session Recovery & Connection Error Handling', () => {
    it('renders connection failure recovery UI on 500 network error and supports retryBootstrap', async () => {
      let attempt = 0;
      fetchSpy.mockImplementation((url) => {
        const urlStr = extractUrl(url);
        if (urlStr.includes('/api/v1/auth/refresh')) {
          attempt++;
          if (attempt === 1) {
            return Promise.resolve(
              createMockResponse({ message: 'Authentication Gateway Error' }, 500),
            );
          }
          return Promise.resolve(createMockResponse({ accessToken: 'recovered-token' }, 200));
        }
        if (urlStr.includes('/api/v1/auth/me')) {
          return Promise.resolve(createMockResponse(TEST_USER, 200));
        }
        return Promise.resolve(createMockResponse({}, 200));
      });

      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <MemoryRouter initialEntries={['/dashboard']}>
            <AuthProvider>
              <Routes>
                <Route element={<ProtectedRoute />}>
                  <Route path="/dashboard" element={<div>Recovered Dashboard</div>} />
                </Route>
              </Routes>
            </AuthProvider>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Verify connection failure card rendered
      await waitFor(() => {
        expect(screen.getByText(/Authentication Gateway Connection Failure/i)).toBeInTheDocument();
      });

      // Click Retry Connection
      const retryBtn = screen.getByRole('button', { name: /Retry Connection/i });
      fireEvent.click(retryBtn);

      // Verify session recovery
      await waitFor(() => {
        expect(screen.getByText('Recovered Dashboard')).toBeInTheDocument();
      });

      expect(authTokenStore.getAccessToken()).toBe('recovered-token');
    });
  });

  describe('5. Explicit Logout Transition', () => {
    it('executes server logout, clears memory token, and sets status to UNAUTHENTICATED', async () => {
      const LogoutConsumer: React.FC = () => {
        const { status, logout } = useAuth();
        return (
          <div>
            <span data-testid="auth-status">{status}</span>
            <button data-testid="logout-btn" onClick={() => void logout()}>
              Logout
            </button>
          </div>
        );
      };

      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <AuthProvider>
            <LogoutConsumer />
          </AuthProvider>
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('auth-status')).toHaveTextContent('AUTHENTICATED');
      });

      // Trigger Logout
      fireEvent.click(screen.getByTestId('logout-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('auth-status')).toHaveTextContent('UNAUTHENTICATED');
      });

      expect(authTokenStore.getAccessToken()).toBeNull();
    });
  });
});
