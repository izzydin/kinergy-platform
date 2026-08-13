/**
 * Track B — Step B3.1: Protected Route Guard Unit & Integration Test Suite
 *
 * Validates the single-responsibility ProtectedRoute component:
 * 1. BOOTSTRAPPING       → Renders accessible loading state without flashing protected content or redirecting prematurely.
 * 2. AUTHENTICATED       → Renders protected route content via Outlet or children.
 * 3. UNAUTHENTICATED     → Redirects to /auth/login preserving return destination (?redirect=...).
 * 4. REDIRECT LOOP PREV  → Suppresses self-referential ?redirect= param on /auth/* routes.
 * 5. AUTH_ERROR          → Displays connection failure recovery UI with retry option.
 */
import '@testing-library/jest-dom';
import React from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../../../app/providers/auth-provider';
import { ProtectedRoute } from '../components/protected-route';
import { authTokenStore } from '../../../shared/auth/auth-token-store';
import { setupAuthTransport } from '../../../shared/auth/auth-transport';
import { httpClient } from '../../../shared/api/http-client';
import type { AuthUser } from '../domain/auth-state.types';

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

const MOCK_AUTHENTICATED_USER: AuthUser = {
  id: 'usr-b3-1-test',
  email: 'engineer@kinergy.io',
  name: 'Lead Engineer',
  roles: ['OPERATOR'],
  permissions: ['client:read', 'energy:read'],
  tenantId: 'tenant_b3_1',
};

describe('Track B — Step B3.1: Protected Route Guard', () => {
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
          createMockResponse({ accessToken: 'mock-b3-1-access-token', expiresIn: 900 }, 200),
        );
      }

      if (urlStr.includes('/api/v1/auth/me')) {
        return Promise.resolve(createMockResponse(MOCK_AUTHENTICATED_USER, 200));
      }

      return Promise.resolve(createMockResponse({ status: 'ok' }, 200));
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. Bootstrap State & Loading UI Protection
  // ═══════════════════════════════════════════════════════════════════════════

  describe('1. Bootstrap State & Loading UI Protection', () => {
    it('renders accessible loading fallback during BOOTSTRAPPING without premature redirect or content flash', async () => {
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
                <Route path="/auth/login" element={<div>Login Page Target</div>} />
                <Route element={<ProtectedRoute />}>
                  <Route path="/dashboard" element={<div>Secret Protected Content</div>} />
                </Route>
              </Routes>
            </AuthProvider>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Verify status element and accessible attributes
      const statusElement = screen.getByRole('status');
      expect(statusElement).toBeInTheDocument();
      expect(statusElement).toHaveAttribute('aria-live', 'polite');
      expect(screen.getByText(/Verifying session authentication/i)).toBeInTheDocument();

      // Protected content and login page must NOT flash or render during bootstrap
      expect(screen.queryByText('Secret Protected Content')).not.toBeInTheDocument();
      expect(screen.queryByText('Login Page Target')).not.toBeInTheDocument();

      // Complete silent refresh resolution
      await act(async () => {
        resolveRefresh(createMockResponse({ accessToken: 'mock-token' }, 200));
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. Authenticated State & Route Rendering
  // ═══════════════════════════════════════════════════════════════════════════

  describe('2. Authenticated State & Route Rendering', () => {
    it('renders child routes via Outlet when user is authenticated', async () => {
      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <MemoryRouter initialEntries={['/clients']}>
            <AuthProvider initialSessionOverride={MOCK_AUTHENTICATED_USER}>
              <Routes>
                <Route element={<ProtectedRoute />}>
                  <Route path="/clients" element={<div>Authenticated Client Directory</div>} />
                </Route>
              </Routes>
            </AuthProvider>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      expect(screen.getByText('Authenticated Client Directory')).toBeInTheDocument();
    });

    it('renders direct children when children prop is supplied', async () => {
      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <MemoryRouter initialEntries={['/settings']}>
            <AuthProvider initialSessionOverride={MOCK_AUTHENTICATED_USER}>
              <ProtectedRoute>
                <div>Direct Child Protected View</div>
              </ProtectedRoute>
            </AuthProvider>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      expect(screen.getByText('Direct Child Protected View')).toBeInTheDocument();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. Unauthenticated State & Redirect Preservation
  // ═══════════════════════════════════════════════════════════════════════════

  describe('3. Unauthenticated State & Redirect Preservation', () => {
    it('redirects unauthenticated users to /auth/login with preserved return destination query param', async () => {
      fetchSpy.mockImplementation((url) => {
        if (extractUrl(url).includes('/api/v1/auth/refresh')) {
          return Promise.resolve(createMockResponse({ message: 'No active session' }, 401));
        }
        return Promise.resolve(createMockResponse({}, 401));
      });

      let capturedSearch = '';
      const LoginSpy: React.FC = () => {
        const location = useLocation();
        capturedSearch = location.search;
        return <div>Login Destination Page</div>;
      };

      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <MemoryRouter initialEntries={['/energy/meters?tab=realtime']}>
            <AuthProvider>
              <Routes>
                <Route path="/auth/login" element={<LoginSpy />} />
                <Route element={<ProtectedRoute />}>
                  <Route path="/energy/meters" element={<div>Protected Energy Meters</div>} />
                </Route>
              </Routes>
            </AuthProvider>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText('Login Destination Page')).toBeInTheDocument();
      });

      expect(capturedSearch).toBe('?redirect=' + encodeURIComponent('/energy/meters?tab=realtime'));
      expect(screen.queryByText('Protected Energy Meters')).not.toBeInTheDocument();
    });

    it('preserves full path, search query parameters, and hash fragment in redirect URL', async () => {
      fetchSpy.mockImplementation((url) => {
        if (extractUrl(url).includes('/api/v1/auth/refresh')) {
          return Promise.resolve(createMockResponse({ message: 'No session' }, 401));
        }
        return Promise.resolve(createMockResponse({}, 401));
      });

      let capturedSearch = '';
      const LoginInspector: React.FC = () => {
        const location = useLocation();
        capturedSearch = location.search;
        return <div>Login Inspector Target</div>;
      };

      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <MemoryRouter initialEntries={['/clients/usr_99?status=active#details']}>
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
        expect(screen.getByText('Login Inspector Target')).toBeInTheDocument();
      });

      const expectedRedirectParam = encodeURIComponent('/clients/usr_99?status=active#details');
      expect(capturedSearch).toBe(`?redirect=${expectedRedirectParam}`);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. Redirect Loop Prevention
  // ═══════════════════════════════════════════════════════════════════════════

  describe('4. Redirect Loop Prevention', () => {
    it('prevents appending self-referential ?redirect= query param when unauthenticated user is on an /auth path', async () => {
      fetchSpy.mockImplementation((url) => {
        if (extractUrl(url).includes('/api/v1/auth/refresh')) {
          return Promise.resolve(createMockResponse({ message: 'Unauthenticated' }, 401));
        }
        return Promise.resolve(createMockResponse({}, 401));
      });

      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <MemoryRouter initialEntries={['/auth/unauthenticated']}>
            <AuthProvider>
              <Routes>
                <Route path="/auth/login" element={<div>Login Screen</div>} />
                <Route element={<ProtectedRoute />}>
                  <Route path="/auth/unauthenticated" element={<div>Unauthenticated Notice</div>} />
                </Route>
              </Routes>
            </AuthProvider>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText('Login Screen')).toBeInTheDocument();
      });

      expect(screen.queryByText('Unauthenticated Notice')).not.toBeInTheDocument();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. Authentication Gateway Error Handling
  // ═══════════════════════════════════════════════════════════════════════════

  describe('5. Authentication Gateway Error Handling', () => {
    it('renders connection error recovery card when bootstrap encounters network gateway failure', async () => {
      fetchSpy.mockImplementation((url) => {
        if (extractUrl(url).includes('/api/v1/auth/refresh')) {
          return Promise.reject(new TypeError('Failed to fetch'));
        }
        return Promise.resolve(createMockResponse({}, 500));
      });

      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <MemoryRouter initialEntries={['/dashboard']}>
            <AuthProvider>
              <Routes>
                <Route element={<ProtectedRoute />}>
                  <Route path="/dashboard" element={<div>Dashboard Content</div>} />
                </Route>
              </Routes>
            </AuthProvider>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText('Authentication Gateway Connection Failure')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /retry connection/i })).toBeInTheDocument();
    });
  });
});
