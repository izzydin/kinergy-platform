/**
 * Track B — Step B3.2: Unauthorized & Forbidden Experience Integration Test Suite
 *
 * Validates the strict semantic boundary between Authentication (401 Unauthorized)
 * and Authorization (403 Forbidden):
 *
 * 1. 401 Unauthorized Handling:
 *    - Unauthenticated user navigating to protected route is redirected to /auth/login?redirect=...
 *    - Dedicated /auth/unauthenticated route renders accessible <UnauthenticatedView />.
 *
 * 2. 403 Forbidden Handling:
 *    - Authenticated user missing required permissions renders <ForbiddenView /> (403 Access Denied).
 *    - DOES NOT redirect to /auth/login under any circumstances.
 *
 * 3. Accessibility & UX Standards:
 *    - Semantic headings (<h2>), ARIA live regions (role="alert", aria-live="polite"), focusable action controls.
 */
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../../providers/auth-provider';
import { ProtectedRoute } from '../protected-route';
import { RequirePermission } from '../permission-guard';
import { ForbiddenView, UnauthenticatedView } from '../fallback-views';
import { authTokenStore } from '../../../shared/auth/auth-token-store';
import { setupAuthTransport } from '../../../shared/auth/auth-transport';
import { httpClient } from '../../../shared/api/http-client';
import type { AuthUser } from '../../../modules/auth/domain/auth-state.types';

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

const AUTHORIZED_USER: AuthUser = {
  id: 'usr-b3-2-authorized',
  email: 'operator@kinergy.io',
  name: 'Authorized Operator',
  roles: ['OPERATOR'],
  permissions: ['client:read', 'energy:read'],
  tenantId: 'tenant_b3_2',
};

const RESTRICTED_USER: AuthUser = {
  id: 'usr-b3-2-restricted',
  email: 'restricted@kinergy.io',
  name: 'Restricted User',
  roles: ['VIEWER'],
  permissions: ['client:read'], // Lacks admin:read and energy:write
  tenantId: 'tenant_b3_2',
};

describe('Track B — Step B3.2: Unauthorized & Forbidden Experience', () => {
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
          createMockResponse({ accessToken: 'mock-b3-2-access-token', expiresIn: 900 }, 200),
        );
      }

      if (urlStr.includes('/api/v1/auth/me')) {
        return Promise.resolve(createMockResponse(AUTHORIZED_USER, 200));
      }

      return Promise.resolve(createMockResponse({ status: 'ok' }, 200));
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. Unauthorized (401) Access Handling
  // ═══════════════════════════════════════════════════════════════════════════

  describe('1. Unauthorized (401) Access Handling', () => {
    it('redirects unauthenticated users attempting to access protected route to /auth/login', async () => {
      fetchSpy.mockImplementation((url) => {
        if (extractUrl(url).includes('/api/v1/auth/refresh')) {
          return Promise.resolve(createMockResponse({ message: 'No active session' }, 401));
        }
        return Promise.resolve(createMockResponse({}, 401));
      });

      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <MemoryRouter initialEntries={['/clients']}>
            <AuthProvider>
              <Routes>
                <Route path="/auth/login" element={<div>Public Login Page</div>} />
                <Route element={<ProtectedRoute />}>
                  <Route path="/clients" element={<div>Protected Client Directory</div>} />
                </Route>
              </Routes>
            </AuthProvider>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText('Public Login Page')).toBeInTheDocument();
      });

      expect(screen.queryByText('Protected Client Directory')).not.toBeInTheDocument();
    });

    it('renders accessible UnauthenticatedView (401) on dedicated /auth/unauthenticated route', async () => {
      render(
        <MemoryRouter initialEntries={['/auth/unauthenticated']}>
          <Routes>
            <Route path="/auth/unauthenticated" element={<UnauthenticatedView />} />
          </Routes>
        </MemoryRouter>,
      );

      // Verify heading hierarchy and content
      const heading = screen.getByRole('heading', { level: 2, name: /401 — Session Expired/i });
      expect(heading).toBeInTheDocument();

      // Verify ARIA role and live region
      const alertContainer = screen.getByRole('alert');
      expect(alertContainer).toHaveAttribute('aria-live', 'polite');

      // Verify focusable action link
      const loginLink = screen.getByRole('link', { name: /Log In Again/i });
      expect(loginLink).toBeInTheDocument();
      expect(loginLink).toHaveAttribute('href', '/auth/login');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. Forbidden (403) Authorization Failure Handling
  // ═══════════════════════════════════════════════════════════════════════════

  describe('2. Forbidden (403) Authorization Failure Handling', () => {
    it('renders ForbiddenView (403) when authenticated user lacks required permissions without redirecting to login', async () => {
      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <MemoryRouter initialEntries={['/admin/settings']}>
            <AuthProvider initialSessionOverride={RESTRICTED_USER}>
              <Routes>
                <Route path="/auth/login" element={<div>Login Page (Must Not Render)</div>} />
                <Route element={<ProtectedRoute />}>
                  <Route
                    path="/admin/settings"
                    element={
                      <RequirePermission permission="admin:read">
                        <div>Admin Settings Content</div>
                      </RequirePermission>
                    }
                  />
                </Route>
              </Routes>
            </AuthProvider>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Must render 403 Forbidden Access Denied heading
      await waitFor(() => {
        expect(
          screen.getByRole('heading', { level: 2, name: /403 — Access Denied/i }),
        ).toBeInTheDocument();
      });

      // Must display detailed permission error message
      expect(
        screen.getByText(/Access Denied: Missing required security claim \(admin:read\)/i),
      ).toBeInTheDocument();

      // Must NOT render protected content OR redirect to login page
      expect(screen.queryByText('Admin Settings Content')).not.toBeInTheDocument();
      expect(screen.queryByText('Login Page (Must Not Render)')).not.toBeInTheDocument();
    });

    it('grants access and renders protected view when authenticated user possesses required permission', async () => {
      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <MemoryRouter initialEntries={['/clients']}>
            <AuthProvider initialSessionOverride={AUTHORIZED_USER}>
              <Routes>
                <Route element={<ProtectedRoute />}>
                  <Route
                    path="/clients"
                    element={
                      <RequirePermission permission="client:read">
                        <div>Authorized Client Overview</div>
                      </RequirePermission>
                    }
                  />
                </Route>
              </Routes>
            </AuthProvider>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      expect(screen.getByText('Authorized Client Overview')).toBeInTheDocument();
      expect(
        screen.queryByRole('heading', { level: 2, name: /403 — Access Denied/i }),
      ).not.toBeInTheDocument();
    });

    it('enforces accessibility standards on ForbiddenView component', () => {
      render(
        <MemoryRouter>
          <ForbiddenView message="Custom permission error message" />
        </MemoryRouter>,
      );

      // Accessible heading level 2
      expect(
        screen.getByRole('heading', { level: 2, name: /403 — Access Denied/i }),
      ).toBeInTheDocument();

      // Live region alert container
      const alertRegion = screen.getByRole('alert');
      expect(alertRegion).toHaveAttribute('aria-live', 'polite');

      // Focusable dashboard return link
      const returnLink = screen.getByRole('link', { name: /Return to Dashboard/i });
      expect(returnLink).toBeInTheDocument();
      expect(returnLink).toHaveAttribute('href', '/');
    });
  });
});
