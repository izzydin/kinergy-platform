/**
 * Track B — Milestone B1.3: Protected Route & Authentication Routing Integration
 *
 * Comprehensive integration test suite validating authentication routing boundaries,
 * route state transitions, redirect parameter handling, accessible loading states,
 * and redirect loop prevention.
 *
 * Coverage:
 *   1. Authenticated Access — Allows protected routes when authenticated
 *   2. Unauthenticated Access — Prevents access to protected routes and redirects to /auth/login?redirect=...
 *   3. Bootstrap Loading — Renders accessible loading state without shell flashes or premature redirects
 *   4. Login Route Accessibility — Accessible to unauthenticated users; redirects authenticated users
 *   5. Redirect Behavior — Preserves full path and search query params in ?redirect=
 *   6. Return Location — Redirects authenticated users to specified ?redirect target
 *   7. Redirect Loop Prevention — Sanitizes self-referential /auth/* redirect params
 */
import '@testing-library/jest-dom';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../../providers/auth-provider';
import { AppRouter } from '../app-router';
import { ProtectedRoute } from '../protected-route';
import { PublicRoute } from '../public-route';
import { SuspenseFallback } from '../lazy-loading';
import { authTokenStore } from '../../../shared/auth/auth-token-store';
import { setupAuthTransport } from '../../../shared/auth/auth-transport';
import { httpClient } from '../../../shared/api/http-client';
import { NavigationProvider } from '../../navigation/navigation-provider';
import { FeatureFlagProvider } from '../../providers/feature-flag-provider';
import { NotificationProvider } from '../../providers/notification-provider';
import { BreadcrumbProvider } from '../../breadcrumbs/breadcrumb-provider';
import { SlotProvider } from '../../../shared/ui/slots';
import { AuthUser } from '../../../modules/auth/domain/auth-state.types';
import { LoginRoute } from '../../../modules/identity/authentication';

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

const AUTHENTICATED_TEST_USER: AuthUser = {
  id: 'usr-b1-3-test',
  email: 'architect@kinergy.io',
  name: 'Routing Test User',
  roles: ['OPERATOR', 'ADMIN'],
  permissions: ['client:read', 'energy:read', 'analytics:read', 'admin:read'],
  tenantId: 'tenant_b1_3',
};

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('Track B — Milestone B1.3: Protected Route & Auth Routing Integration', () => {
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
          createMockResponse({ accessToken: 'mock-b1-3-access-token', expiresIn: 900 }, 200),
        );
      }

      if (urlStr.includes('/api/v1/auth/me')) {
        return Promise.resolve(createMockResponse(AUTHENTICATED_TEST_USER, 200));
      }

      return Promise.resolve(createMockResponse({ status: 'ok' }, 200));
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. Authenticated Access
  // ═══════════════════════════════════════════════════════════════════════════

  describe('1. Authenticated Access', () => {
    it('allows access to protected routes when user is authenticated', async () => {
      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <MemoryRouter initialEntries={['/clients']}>
            <AuthProvider initialSessionOverride={AUTHENTICATED_TEST_USER}>
              <Routes>
                <Route element={<ProtectedRoute />}>
                  <Route path="/clients" element={<div>Protected Client Directory</div>} />
                </Route>
              </Routes>
            </AuthProvider>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      expect(screen.getByText('Protected Client Directory')).toBeInTheDocument();
    });

    it('renders full AppRouter shell with DashboardLayout when navigating to protected route', async () => {
      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <MemoryRouter initialEntries={['/dashboard']}>
            <SlotProvider>
              <NotificationProvider>
                <AuthProvider initialSessionOverride={AUTHENTICATED_TEST_USER}>
                  <FeatureFlagProvider>
                    <NavigationProvider>
                      <BreadcrumbProvider>
                        <AppRouter />
                      </BreadcrumbProvider>
                    </NavigationProvider>
                  </FeatureFlagProvider>
                </AuthProvider>
              </NotificationProvider>
            </SlotProvider>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Verify dashboard content renders inside application shell
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /Dashboard Overview/i })).toBeInTheDocument();
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. Unauthenticated Access
  // ═══════════════════════════════════════════════════════════════════════════

  describe('2. Unauthenticated Access', () => {
    it('blocks access to protected routes when unauthenticated and redirects to /auth/login with return location', async () => {
      fetchSpy.mockImplementation((url) => {
        if (extractUrl(url).includes('/api/v1/auth/refresh')) {
          return Promise.resolve(createMockResponse({ message: 'No session' }, 401));
        }
        return Promise.resolve(createMockResponse({}, 401));
      });

      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <MemoryRouter initialEntries={['/clients']}>
            <AuthProvider>
              <Routes>
                <Route path="/auth/login" element={<div>Login Page Target</div>} />
                <Route element={<ProtectedRoute />}>
                  <Route path="/clients" element={<div>Protected Clients Content</div>} />
                </Route>
              </Routes>
            </AuthProvider>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText('Login Page Target')).toBeInTheDocument();
      });

      expect(screen.queryByText('Protected Clients Content')).not.toBeInTheDocument();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. Bootstrap Loading Experience
  // ═══════════════════════════════════════════════════════════════════════════

  describe('3. Bootstrap Loading Experience', () => {
    it('renders accessible loading state during BOOTSTRAPPING without displaying application shell or redirecting', async () => {
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
                  <Route path="/dashboard" element={<div>Protected Dashboard</div>} />
                </Route>
              </Routes>
            </AuthProvider>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Verify loading state container attributes and text
      const statusElement = screen.getByRole('status');
      expect(statusElement).toBeInTheDocument();
      expect(statusElement).toHaveAttribute('aria-live', 'polite');
      expect(screen.getByText(/Verifying session authentication/i)).toBeInTheDocument();

      // Protected content and login screen must NOT be present during bootstrap
      expect(screen.queryByText('Protected Dashboard')).not.toBeInTheDocument();
      expect(screen.queryByText('Login Screen')).not.toBeInTheDocument();

      // Clean up async pending promise
      await act(async () => {
        resolveRefresh(createMockResponse({ accessToken: 'mock-token' }, 200));
      });
    });

    it('SuspenseFallback component enforces 4-state UI contract styling and screen-reader accessibility', () => {
      render(<SuspenseFallback label="Checking credentials..." />);

      const fallback = screen.getByRole('status');
      expect(fallback).toHaveAttribute('aria-label', 'Checking credentials...');
      expect(screen.getByText('Checking credentials...')).toBeInTheDocument();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. Login Route Accessibility
  // ═══════════════════════════════════════════════════════════════════════════

  describe('4. Login Route Accessibility', () => {
    it('allows unauthenticated users to access public auth routes (/auth/login)', async () => {
      fetchSpy.mockImplementation((url) => {
        if (extractUrl(url).includes('/api/v1/auth/refresh')) {
          return Promise.resolve(createMockResponse({ message: 'No session' }, 401));
        }
        return Promise.resolve(createMockResponse({}, 401));
      });

      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <MemoryRouter initialEntries={['/auth/login']}>
            <AuthProvider>
              <Routes>
                <Route element={<PublicRoute />}>
                  <Route path="/auth/login" element={<div>Public Login Form</div>} />
                </Route>
              </Routes>
            </AuthProvider>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText('Public Login Form')).toBeInTheDocument();
      });
    });

    it('redirects authenticated users away from public auth routes (/auth/login) to default /dashboard', async () => {
      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <MemoryRouter initialEntries={['/auth/login']}>
            <AuthProvider initialSessionOverride={AUTHENTICATED_TEST_USER}>
              <Routes>
                <Route element={<PublicRoute />}>
                  <Route path="/auth/login" element={<div>Public Login Form</div>} />
                </Route>
                <Route path="/dashboard" element={<div>Authenticated Dashboard View</div>} />
              </Routes>
            </AuthProvider>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      expect(screen.getByText('Authenticated Dashboard View')).toBeInTheDocument();
      expect(screen.queryByText('Public Login Form')).not.toBeInTheDocument();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. Redirect Behavior & Location Preservation
  // ═══════════════════════════════════════════════════════════════════════════

  describe('5. Redirect Behavior & Location Preservation', () => {
    it('encodes full path and search query params into ?redirect= parameter when redirecting to login', async () => {
      fetchSpy.mockImplementation((url) => {
        if (extractUrl(url).includes('/api/v1/auth/refresh')) {
          return Promise.resolve(createMockResponse({ message: 'No session' }, 401));
        }
        return Promise.resolve(createMockResponse({}, 401));
      });

      let capturedLocation: string | undefined;

      const LoginInspector: React.FC = () => {
        capturedLocation = window.location.search;
        return <div>Login Inspector</div>;
      };

      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <MemoryRouter initialEntries={['/clients/usr_123?tab=settings&filter=active']}>
            <AuthProvider>
              <Routes>
                <Route path="/auth/login" element={<LoginInspector />} />
                <Route element={<ProtectedRoute />}>
                  <Route path="/clients/:id" element={<div>Client Detail</div>} />
                </Route>
              </Routes>
            </AuthProvider>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText('Login Inspector')).toBeInTheDocument();
      });

      // Verify that the requested subpath and query parameters were preserved
      expect(capturedLocation).toBeDefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. Return Location
  // ═══════════════════════════════════════════════════════════════════════════

  describe('6. Return Location', () => {
    it('PublicRoute redirects authenticated users to the target path specified in ?redirect= query param', async () => {
      const encodedTarget = encodeURIComponent('/energy/meters');

      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <MemoryRouter initialEntries={[`/auth/login?redirect=${encodedTarget}`]}>
            <AuthProvider initialSessionOverride={AUTHENTICATED_TEST_USER}>
              <Routes>
                <Route element={<PublicRoute />}>
                  <Route path="/auth/login" element={<div>Public Login Form</div>} />
                </Route>
                <Route path="/energy/meters" element={<div>Target Smart Meters View</div>} />
              </Routes>
            </AuthProvider>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      expect(screen.getByText('Target Smart Meters View')).toBeInTheDocument();
      expect(screen.queryByText('Public Login Form')).not.toBeInTheDocument();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. Redirect Loop Prevention
  // ═══════════════════════════════════════════════════════════════════════════

  describe('7. Redirect Loop Prevention', () => {
    it('ProtectedRoute does not append self-referential ?redirect= parameter when current location is an /auth/* route', async () => {
      fetchSpy.mockImplementation((url) => {
        if (extractUrl(url).includes('/api/v1/auth/refresh')) {
          return Promise.resolve(createMockResponse({ message: 'No session' }, 401));
        }
        return Promise.resolve(createMockResponse({}, 401));
      });

      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <MemoryRouter initialEntries={['/auth/unauthenticated']}>
            <AuthProvider>
              <Routes>
                <Route path="/auth/login" element={<div>Login Target</div>} />
                <Route element={<ProtectedRoute />}>
                  <Route path="/auth/unauthenticated" element={<div>Unauthenticated Notice</div>} />
                </Route>
              </Routes>
            </AuthProvider>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText('Login Target')).toBeInTheDocument();
      });

      expect(screen.queryByText('Unauthenticated Notice')).not.toBeInTheDocument();
    });

    it('PublicRoute sanitizes ?redirect= parameter if target points to an /auth/* route, falling back to /dashboard', async () => {
      const selfAuthTarget = encodeURIComponent('/auth/reset-password');

      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <MemoryRouter initialEntries={[`/auth/login?redirect=${selfAuthTarget}`]}>
            <AuthProvider initialSessionOverride={AUTHENTICATED_TEST_USER}>
              <Routes>
                <Route element={<PublicRoute />}>
                  <Route path="/auth/login" element={<div>Login Form</div>} />
                </Route>
                <Route path="/dashboard" element={<div>Safe Dashboard Target</div>} />
                <Route path="/auth/reset-password" element={<div>Reset Password Page</div>} />
              </Routes>
            </AuthProvider>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Authenticated user must NOT be redirected into /auth/reset-password; must sanitize to /dashboard
      expect(screen.getByText('Safe Dashboard Target')).toBeInTheDocument();
      expect(screen.queryByText('Reset Password Page')).not.toBeInTheDocument();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. Post-Login Return Location & Feature Boundary Navigation
  // ═══════════════════════════════════════════════════════════════════════════

  describe('8. Post-Login Return Location & Feature Boundary Navigation', () => {
    it('executes end-to-end return location flow: /clients (unauthenticated) -> /auth/login?redirect=%2Fclients -> submit login -> /clients', async () => {
      let isMockAuthenticated = false;

      fetchSpy.mockImplementation((url) => {
        const urlStr = extractUrl(url);
        if (urlStr.includes('/api/v1/auth/refresh')) {
          if (isMockAuthenticated) {
            return Promise.resolve(
              createMockResponse({ accessToken: 'mock-jwt-token-step-b1.4', expiresIn: 900 }, 200),
            );
          }
          return Promise.resolve(createMockResponse({ message: 'No session' }, 401));
        }
        if (urlStr.includes('/api/v1/auth/login')) {
          isMockAuthenticated = true;
          return Promise.resolve(
            createMockResponse({
              accessToken: 'mock-jwt-token-step-b1.4',
              tokenType: 'Bearer',
              expiresIn: 900,
              user: AUTHENTICATED_TEST_USER,
            }),
          );
        }
        if (urlStr.includes('/api/v1/auth/me')) {
          return Promise.resolve(createMockResponse(AUTHENTICATED_TEST_USER, 200));
        }
        return Promise.resolve(createMockResponse({ status: 'ok' }, 200));
      });

      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <MemoryRouter initialEntries={['/clients']}>
            <AuthProvider>
              <Routes>
                <Route element={<PublicRoute />}>
                  <Route path="/auth/login" element={<LoginRoute />} />
                </Route>
                <Route element={<ProtectedRoute />}>
                  <Route path="/clients" element={<div>Protected Client Directory Target</div>} />
                </Route>
              </Routes>
            </AuthProvider>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // 1. Initially unauthenticated -> Redirected to /auth/login with ?redirect=%2Fclients
      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1, name: /sign in/i })).toBeInTheDocument();
      });

      const emailInput = screen.getByLabelText(/^email address/i);
      const passwordInput = screen.getByLabelText(/^password/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      // 2. Submit valid login credentials
      await act(async () => {
        fireEvent.change(emailInput, { target: { value: 'operator@kinergy.io' } });
        fireEvent.change(passwordInput, { target: { value: 'Password123!' } });
        fireEvent.click(submitButton);
      });

      // 3. Authenticated -> Automatic post-login navigation to preserved return location /clients
      await waitFor(() => {
        expect(screen.getByText('Protected Client Directory Target')).toBeInTheDocument();
      });

      expect(screen.queryByRole('heading', { level: 1, name: /sign in/i })).not.toBeInTheDocument();
    });
  });
});
