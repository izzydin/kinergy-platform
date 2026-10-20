/**
 * Track B — Step B3.4: Routing Architecture Integration Test Suite
 *
 * Validates the complete React Router hierarchy:
 * 1. Public Routes   → AuthLayout (/auth/login, /auth/reset-password)
 * 2. Protected Routes → ProtectedRoute -> DashboardLayout (/dashboard, /settings, domain sub-routers)
 * 3. Layout Integrity → Breadcrumbs, Navigation, Slot System, Sidebar & Responsive Shell
 * 4. Screen Access   → Unauthenticated redirect to Login; Authenticated Dashboard & Settings rendering
 * 5. Direct URL Access & Refresh Recovery during BOOTSTRAPPING
 */
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { AppRouter } from '../app-router';
import { AuthProvider } from '../../providers/auth-provider';
import { NavigationProvider } from '../../navigation/navigation-provider';
import { defaultNavigationItems } from '../../navigation/navigation.config';
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

const AUTHENTICATED_ARCHITECT_USER: AuthUser = {
  id: 'usr-b3-4-architect',
  email: 'architect@kinergy.io',
  name: 'Lead Architect',
  roles: ['OPERATOR', 'ADMIN'],
  permissions: ['client:read', 'energy:read', 'analytics:read', 'admin:read', 'settings:write'],
  tenantId: 'tenant_b3_4',
};

const AUTHENTICATED_GYM_STAFF_USER: AuthUser = {
  id: 'usr-gym-staff',
  email: 'gymstaff@kinergy.io',
  name: 'Gym Staff',
  roles: ['OPERATOR'],
  permissions: ['memberships.read', 'gym.attendance.read'],
  tenantId: 'tenant_b3_4',
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

describe('Track B — Step B3.4: Routing Architecture Integration', () => {
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
          createMockResponse({ accessToken: 'mock-b3-4-access-token', expiresIn: 900 }, 200),
        );
      }

      if (urlStr.includes('/api/v1/auth/me')) {
        return Promise.resolve(createMockResponse(AUTHENTICATED_ARCHITECT_USER, 200));
      }

      return Promise.resolve(createMockResponse({ status: 'ok' }, 200));
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. Public Route Hierarchy & AuthLayout Integration
  // ═══════════════════════════════════════════════════════════════════════════

  describe('1. Public Route Hierarchy & AuthLayout Integration', () => {
    it('renders Login route inside AuthLayout for unauthenticated visitors', async () => {
      fetchSpy.mockImplementation((url) => {
        if (extractUrl(url).includes('/api/v1/auth/refresh')) {
          return Promise.resolve(createMockResponse({ message: 'No session' }, 401));
        }
        return Promise.resolve(createMockResponse({}, 401));
      });

      renderAppWithRouter('/auth/login', null);

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1, name: /sign in/i })).toBeInTheDocument();
      });
    });

    it('renders password reset placeholder route inside AuthLayout', async () => {
      fetchSpy.mockImplementation((url) => {
        if (extractUrl(url).includes('/api/v1/auth/refresh')) {
          return Promise.resolve(createMockResponse({ message: 'No session' }, 401));
        }
        return Promise.resolve(createMockResponse({}, 401));
      });

      renderAppWithRouter('/auth/reset-password', null);

      await waitFor(() => {
        expect(screen.getByText('Password Reset View Placeholder')).toBeInTheDocument();
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. Protected Route Hierarchy & DashboardLayout Integration
  // ═══════════════════════════════════════════════════════════════════════════

  describe('2. Protected Route Hierarchy & DashboardLayout Integration', () => {
    it('redirects unauthenticated direct URL access (/dashboard) to /auth/login?redirect=%2Fdashboard', async () => {
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
    });

    it('renders Dashboard Overview screen inside DashboardLayout for authenticated user', async () => {
      renderAppWithRouter('/dashboard', AUTHENTICATED_ARCHITECT_USER);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /Dashboard Overview/i })).toBeInTheDocument();
      });

      // Verify breadcrumbs & shell navigation are intact
      expect(screen.getByRole('navigation', { name: /breadcrumb/i })).toBeInTheDocument();
    });

    it('renders Settings screen inside DashboardLayout for authenticated user', async () => {
      renderAppWithRouter('/settings', AUTHENTICATED_ARCHITECT_USER);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /Platform Settings/i })).toBeInTheDocument();
      });

      // Verify settings description text inside settings layout
      expect(screen.getByText(/Form Foundation/i)).toBeInTheDocument();
    });

    it('redirects root path (/) to /dashboard for authenticated user', async () => {
      renderAppWithRouter('/', AUTHENTICATED_ARCHITECT_USER);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /Dashboard Overview/i })).toBeInTheDocument();
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. Application Session Refresh & Bootstrap State Recovery
  // ═══════════════════════════════════════════════════════════════════════════

  describe('3. Application Session Refresh & Bootstrap State Recovery', () => {
    it('recovers session seamlessly on page refresh (F5) at /settings without premature redirect', async () => {
      let resolveRefresh!: (res: Response) => void;
      const pendingRefresh = new Promise<Response>((res) => {
        resolveRefresh = res;
      });
      fetchSpy.mockImplementationOnce(() => pendingRefresh);

      renderAppWithRouter('/settings');

      // Verify BOOTSTRAPPING loading state
      expect(screen.getByText(/Verifying session authentication/i)).toBeInTheDocument();

      // Resolve silent refresh OK
      await act(async () => {
        resolveRefresh(createMockResponse({ accessToken: 'mock-token' }, 200));
      });

      // Settings screen renders inside application shell
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /Platform Settings/i })).toBeInTheDocument();
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. Obsolete Route Removal & 404 Fallback Verification
  // ═══════════════════════════════════════════════════════════════════════════

  describe('4. Obsolete Route Removal & 404 Fallback Verification', () => {
    it('resolves obsolete /energy route to established 404 NotFoundView', async () => {
      renderAppWithRouter('/energy', AUTHENTICATED_ARCHITECT_USER);

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { level: 2, name: /404 — View Not Found/i }),
        ).toBeInTheDocument();
      });
      expect(screen.queryByText(/Energy Telemetry/i)).not.toBeInTheDocument();
    });

    it('resolves obsolete /analytics route to established 404 NotFoundView', async () => {
      renderAppWithRouter('/analytics', AUTHENTICATED_ARCHITECT_USER);

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { level: 2, name: /404 — View Not Found/i }),
        ).toBeInTheDocument();
      });
      expect(screen.queryByText(/Analytics & Reporting/i)).not.toBeInTheDocument();
    });

    it('ensures defaultNavigationItems contains authoritative entries and excludes obsolete or dead links', () => {
      const paths = defaultNavigationItems.map((item) => item.path);
      const ids = defaultNavigationItems.map((item) => item.id);

      // Exclude obsolete and dead routes
      expect(paths).not.toContain('/energy');
      expect(paths).not.toContain('/analytics');
      expect(paths).not.toContain('/dashboard/ui-states');
      expect(paths).not.toContain('/admin'); // Dead route
      expect(paths).not.toContain('/'); // Consolidated into /dashboard
      expect(ids).not.toContain('energy');
      expect(ids).not.toContain('analytics');
      expect(ids).not.toContain('dashboard-ui-states');
      expect(ids).not.toContain('overview');

      // Include completed authoritative routes
      expect(paths).toContain('/dashboard');
      expect(paths).toContain('/clients');
      expect(paths).toContain('/gym');
      expect(paths).toContain('/attendance');
      expect(paths).toContain('/sales');
      expect(paths).toContain('/resources/overview');
      expect(paths).toContain('/admin/users');
      expect(paths).toContain('/settings');
    });

    it('resolves dead /admin route to 404 NotFoundView', async () => {
      renderAppWithRouter('/admin', AUTHENTICATED_ARCHITECT_USER);

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { level: 2, name: /404 — View Not Found/i }),
        ).toBeInTheDocument();
      });
    });

    it('resolves obsolete /dashboard/ui-states route to 404 NotFoundView', async () => {
      renderAppWithRouter('/dashboard/ui-states', AUTHENTICATED_ARCHITECT_USER);

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { level: 2, name: /404 — View Not Found/i }),
        ).toBeInTheDocument();
      });
      expect(screen.queryByText(/UI State Validation/i)).not.toBeInTheDocument();
    });

    it('resolves obsolete /dashboard/metrics route to 404 NotFoundView', async () => {
      renderAppWithRouter('/dashboard/metrics', AUTHENTICATED_ARCHITECT_USER);

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { level: 2, name: /404 — View Not Found/i }),
        ).toBeInTheDocument();
      });
      expect(screen.queryByText(/Metrics & Performance/i)).not.toBeInTheDocument();
    });

    it('resolves obsolete /shell route to 404 NotFoundView', async () => {
      renderAppWithRouter('/shell', AUTHENTICATED_ARCHITECT_USER);

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { level: 2, name: /404 — View Not Found/i }),
        ).toBeInTheDocument();
      });
      expect(screen.queryByText(/Full Width Main Layout Shell/i)).not.toBeInTheDocument();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. Authoritative Route Registration & Protected Feature Routing
  // ═══════════════════════════════════════════════════════════════════════════

  describe('5. Authoritative Route Registration & Protected Feature Routing', () => {
    it('redirects /gym to /gym/memberships and renders Memberships view for authorized user', async () => {
      renderAppWithRouter('/gym', AUTHENTICATED_GYM_STAFF_USER);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /Gym Memberships/i })).toBeInTheDocument();
      });
    });

    it('blocks direct navigation to /gym with 403 ForbiddenView for user lacking memberships.read', async () => {
      renderAppWithRouter('/gym', AUTHENTICATED_ARCHITECT_USER);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /403.*Access Denied/i })).toBeInTheDocument();
      });
    });

    it('renders AttendanceReceptionPage for authorized user navigating to /attendance', async () => {
      renderAppWithRouter('/attendance', AUTHENTICATED_GYM_STAFF_USER);

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: /Gym Admission & Reception/i }),
        ).toBeInTheDocument();
      });
    });

    it('blocks direct navigation to /attendance with 403 ForbiddenView for user lacking gym.attendance.read', async () => {
      renderAppWithRouter('/attendance', AUTHENTICATED_ARCHITECT_USER);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /403.*Access Denied/i })).toBeInTheDocument();
      });
    });
  });
});
