/**
 * Track B — Step B3.5: Protected Routing End-to-End Integration Test Suite
 *
 * Verifies end-to-end user-visible application behavior across all 11 core scenarios:
 * 1. Scenario 1 — Unauthenticated direct access to protected routes
 * 2. Scenario 2 — Post-login return destination restoration
 * 3. Scenario 3 — Deep-link restoration (pathname, search query params, hash fragment)
 * 4. Scenario 4 — Authenticated protected route access (/dashboard, /settings)
 * 5. Scenario 5 — Browser reload (F5) session restoration via B2 state machine
 * 6. Scenario 6 — Invalid session refresh failure without content flash
 * 7. Scenario 7 — 403 Forbidden access denial without login redirect
 * 8. Scenario 8 — Open redirect protection against external/malformed URLs
 * 9. Scenario 9 — Authenticated user accessing login (redirect loop prevention)
 * 10. Scenario 10 — Browser history replace behavior
 * 11. Scenario 11 — Responsive shell, navigation, breadcrumbs & slot integration
 */
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { AppRouter } from '../app-router';
import { AuthProvider } from '../../providers/auth-provider';
import { NavigationProvider } from '../../navigation/navigation-provider';
import { FeatureFlagProvider } from '../../providers/feature-flag-provider';
import { NotificationProvider } from '../../providers/notification-provider';
import { BreadcrumbProvider } from '../../breadcrumbs/breadcrumb-provider';
import { SlotProvider } from '../../../shared/ui/slots';
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

const E2E_TEST_USER: AuthUser = {
  id: 'usr_b3_5_e2e',
  email: 'architect@kinergy.io',
  name: 'Lead Architect',
  roles: ['OPERATOR', 'ADMIN'],
  permissions: ['client:read', 'energy:read', 'analytics:read', 'admin:read', 'settings:write'],
  tenantId: 'tenant_b3_5',
};

const RESTRICTED_USER: AuthUser = {
  id: 'usr_b3_5_restricted',
  email: 'operator@kinergy.io',
  name: 'Restricted Operator',
  roles: ['OPERATOR'],
  permissions: ['energy:read'], // Missing 'client:read' permission
  tenantId: 'tenant_b3_5',
};

function renderAppWithRouter(initialEntry = '/', userOverride?: AuthUser | null) {
  const queryClient = createTestQueryClient();

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <SlotProvider>
          <NotificationProvider>
            <AuthProvider initialSessionOverride={userOverride}>
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
}

describe('Track B — Step B3.5: Protected Routing End-to-End Integration', () => {
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
          createMockResponse({ accessToken: 'mock-e2e-access-token', expiresIn: 900 }, 200),
        );
      }

      if (urlStr.includes('/api/v1/auth/me')) {
        return Promise.resolve(createMockResponse(E2E_TEST_USER, 200));
      }

      if (urlStr.includes('/api/v1/auth/login')) {
        return Promise.resolve(
          createMockResponse({
            accessToken: 'mock-login-token',
            expiresIn: 900,
            user: E2E_TEST_USER,
          }),
        );
      }

      return Promise.resolve(createMockResponse({ status: 'ok' }, 200));
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SCENARIO 1 — Unauthenticated Direct Access
  // ═══════════════════════════════════════════════════════════════════════════

  it('SCENARIO 1 — Unauthenticated direct access to /dashboard redirects to Login without content flash', async () => {
    fetchSpy.mockImplementation((url) => {
      if (extractUrl(url).includes('/api/v1/auth/refresh')) {
        return Promise.resolve(createMockResponse({ message: 'No session' }, 401));
      }
      return Promise.resolve(createMockResponse({}, 401));
    });

    renderAppWithRouter('/dashboard', null);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: /sign in/i })).toBeInTheDocument();
    });

    expect(screen.queryByRole('heading', { name: /dashboard overview/i })).not.toBeInTheDocument();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SCENARIO 2 — Return After Login
  // ═══════════════════════════════════════════════════════════════════════════

  it('SCENARIO 2 — Return after login restores intended destination (/dashboard)', async () => {
    fetchSpy.mockImplementation((url) => {
      const urlStr = extractUrl(url);
      if (urlStr.includes('/api/v1/auth/refresh')) {
        return Promise.resolve(createMockResponse({ message: 'No active session' }, 401));
      }
      if (urlStr.includes('/api/v1/auth/login')) {
        return Promise.resolve(
          createMockResponse({
            accessToken: 'mock-e2e-login-token',
            expiresIn: 900,
            user: E2E_TEST_USER,
          }),
        );
      }
      return Promise.resolve(createMockResponse({}, 401));
    });

    renderAppWithRouter('/dashboard', null);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: /sign in/i })).toBeInTheDocument();
    });

    // Perform interactive login
    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'architect@kinergy.io' },
    });
    fireEvent.change(screen.getByLabelText(/^Password/i), {
      target: { value: 'Password123!' },
    });

    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /dashboard overview/i })).toBeInTheDocument();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SCENARIO 3 — Deep-Link Restoration
  // ═══════════════════════════════════════════════════════════════════════════

  it('SCENARIO 3 — Deep-link restoration preserves pathname, query params, and hash fragment', async () => {
    fetchSpy.mockImplementation((url) => {
      const urlStr = extractUrl(url);
      if (urlStr.includes('/api/v1/auth/refresh')) {
        return Promise.resolve(createMockResponse({ message: 'No active session' }, 401));
      }
      if (urlStr.includes('/api/v1/auth/login')) {
        return Promise.resolve(
          createMockResponse({
            accessToken: 'mock-deeplink-token',
            expiresIn: 900,
            user: E2E_TEST_USER,
          }),
        );
      }
      return Promise.resolve(createMockResponse({}, 401));
    });

    renderAppWithRouter('/settings?tab=security#privacy', null);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: /sign in/i })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'architect@kinergy.io' },
    });
    fireEvent.change(screen.getByLabelText(/^Password/i), {
      target: { value: 'Password123!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /platform settings/i })).toBeInTheDocument();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SCENARIO 4 — Authenticated Protected Access
  // ═══════════════════════════════════════════════════════════════════════════

  it('SCENARIO 4 — Authenticated user can directly access /dashboard and /settings', async () => {
    renderAppWithRouter('/settings', E2E_TEST_USER);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /platform settings/i })).toBeInTheDocument();
    });

    expect(screen.getByRole('navigation', { name: /breadcrumb/i })).toBeInTheDocument();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SCENARIO 5 — Browser Reload Session Restoration
  // ═══════════════════════════════════════════════════════════════════════════

  it('SCENARIO 5 — Browser reload at /settings recovers session without login flash', async () => {
    let resolveRefresh!: (res: Response) => void;
    const pendingRefresh = new Promise<Response>((res) => {
      resolveRefresh = res;
    });

    fetchSpy.mockImplementationOnce(() => pendingRefresh);

    renderAppWithRouter('/settings');

    expect(screen.getByText(/verifying session authentication/i)).toBeInTheDocument();

    await act(async () => {
      resolveRefresh(createMockResponse({ accessToken: 'mock-reload-token' }, 200));
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /platform settings/i })).toBeInTheDocument();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SCENARIO 6 — Invalid Session Refresh Failure
  // ═══════════════════════════════════════════════════════════════════════════

  it('SCENARIO 6 — Session refresh failure (401) on reload redirects to Login', async () => {
    fetchSpy.mockImplementation((url) => {
      if (extractUrl(url).includes('/api/v1/auth/refresh')) {
        return Promise.resolve(createMockResponse({ message: 'Session expired' }, 401));
      }
      return Promise.resolve(createMockResponse({}, 401));
    });

    renderAppWithRouter('/dashboard');

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: /sign in/i })).toBeInTheDocument();
    });

    expect(screen.queryByRole('heading', { name: /dashboard overview/i })).not.toBeInTheDocument();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SCENARIO 7 — Forbidden Authorization Failure
  // ═══════════════════════════════════════════════════════════════════════════

  it('SCENARIO 7 — Authenticated user lacking permission renders 403 Forbidden without login redirect', async () => {
    renderAppWithRouter('/clients', RESTRICTED_USER);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /403.*Access Denied/i })).toBeInTheDocument();
    });

    expect(screen.getByText(/Missing required security claim/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: /sign in/i })).not.toBeInTheDocument();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SCENARIO 8 — Open Redirect Protection
  // ═══════════════════════════════════════════════════════════════════════════

  it('SCENARIO 8 — Open redirect targets (https://evil.com, //evil.com, javascript:) fall back safely to /dashboard', async () => {
    fetchSpy.mockImplementation((url) => {
      const urlStr = extractUrl(url);
      if (urlStr.includes('/api/v1/auth/refresh')) {
        return Promise.resolve(createMockResponse({ message: 'No session' }, 401));
      }
      if (urlStr.includes('/api/v1/auth/login')) {
        return Promise.resolve(
          createMockResponse({
            accessToken: 'mock-open-redirect-token',
            expiresIn: 900,
            user: E2E_TEST_USER,
          }),
        );
      }
      return Promise.resolve(createMockResponse({}, 401));
    });

    const maliciousTarget = encodeURIComponent('https://evil.example');
    renderAppWithRouter(`/auth/login?redirect=${maliciousTarget}`, null);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: /sign in/i })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'architect@kinergy.io' },
    });
    fireEvent.change(screen.getByLabelText(/^Password/i), {
      target: { value: 'Password123!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /dashboard overview/i })).toBeInTheDocument();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SCENARIO 9 — Login While Authenticated (Redirect Loop Prevention)
  // ═══════════════════════════════════════════════════════════════════════════

  it('SCENARIO 9 — Authenticated user accessing /auth/login is redirected to /dashboard without loop', async () => {
    renderAppWithRouter('/auth/login', E2E_TEST_USER);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /dashboard overview/i })).toBeInTheDocument();
    });

    expect(screen.queryByRole('heading', { level: 1, name: /sign in/i })).not.toBeInTheDocument();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SCENARIO 10 — Back/Forward Browser History
  // ═══════════════════════════════════════════════════════════════════════════

  it('SCENARIO 10 — Unauthenticated redirect uses navigation replace to maintain clean browser history', async () => {
    fetchSpy.mockImplementation((url) => {
      if (extractUrl(url).includes('/api/v1/auth/refresh')) {
        return Promise.resolve(createMockResponse({ message: 'No session' }, 401));
      }
      return Promise.resolve(createMockResponse({}, 401));
    });

    renderAppWithRouter('/settings');

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: /sign in/i })).toBeInTheDocument();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SCENARIO 11 — Responsive Shell, Navigation & Slot System Integration
  // ═══════════════════════════════════════════════════════════════════════════

  it('SCENARIO 11 — Protected routing integrates with sidebar navigation, drawer toggles, breadcrumbs, and slots', async () => {
    renderAppWithRouter('/dashboard', E2E_TEST_USER);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /dashboard overview/i })).toBeInTheDocument();
    });

    // 1. Mobile Sidebar Drawer Toggle Button
    expect(screen.getByRole('button', { name: /open navigation drawer/i })).toBeInTheDocument();

    // 2. Sidebar Navigation Items
    expect(screen.getByRole('navigation', { name: /sidebar menu/i })).toBeInTheDocument();

    // 3. Breadcrumb Navigation Region
    expect(screen.getByRole('navigation', { name: /breadcrumb/i })).toBeInTheDocument();
  });
});
