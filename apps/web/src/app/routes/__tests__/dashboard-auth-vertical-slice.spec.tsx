/**
 * Track B — Step B4.4: Dashboard Authentication Vertical Slice Test Suite
 *
 * End-to-end integration test suite validating the complete vertical slice:
 * AuthProvider -> ProtectedRoute -> DashboardLayout -> Sidebar -> Header -> Current User -> UserMenu -> Reactive Logout
 */
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../../providers/auth-provider';
import { FeatureFlagProvider } from '../../providers/feature-flag-provider';
import { BreadcrumbProvider } from '../../breadcrumbs/breadcrumb-provider';
import { NavigationProvider } from '../../navigation';
import { NotificationProvider } from '../../providers/notification-provider';
import { SlotProvider } from '../../../shared/ui/slots';
import { AppRouter } from '../app-router';
import type { AuthUser } from '../../../modules/auth/domain/auth-state.types';

const VERTICAL_SLICE_USER: AuthUser = {
  id: 'usr_vertical_slice',
  email: 'lead.architect@kinergy.io',
  name: 'Lead Architect',
  roles: ['ADMIN', 'OPERATOR'],
  permissions: ['admin:read', 'client:read'],
  tenantId: 'tenant_vertical_slice',
};

function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function renderVerticalSlice(
  initialEntries: string[] = ['/dashboard'],
  initialSession: AuthUser | null = null,
) {
  const queryClient = createTestQueryClient();

  return render(
    <QueryClientProvider client={queryClient}>
      <NotificationProvider>
        <AuthProvider initialSessionOverride={initialSession}>
          <FeatureFlagProvider>
            <SlotProvider>
              <MemoryRouter initialEntries={initialEntries}>
                <NavigationProvider>
                  <BreadcrumbProvider>
                    <AppRouter />
                  </BreadcrumbProvider>
                </NavigationProvider>
              </MemoryRouter>
            </SlotProvider>
          </FeatureFlagProvider>
        </AuthProvider>
      </NotificationProvider>
    </QueryClientProvider>,
  );
}

describe('Track B — Step B4.4: Dashboard Authentication Vertical Slice Integration', () => {
  beforeEach(() => {
    if (!global.fetch) {
      (global as unknown as { fetch: typeof fetch }).fetch = jest.fn();
    }
    jest.spyOn(global, 'fetch').mockImplementation((url) => {
      const urlStr = typeof url === 'string' ? url : (url as Request).url;

      if (urlStr.includes('/api/v1/auth/me')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'Content-Type': 'application/json' }),
          json: () =>
            Promise.resolve({
              user: VERTICAL_SLICE_USER,
            }),
        } as Response);
      }

      if (urlStr.includes('/api/v1/auth/login')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'Content-Type': 'application/json' }),
          json: () =>
            Promise.resolve({
              user: VERTICAL_SLICE_USER,
              accessToken: 'mock_access_token',
            }),
        } as Response);
      }

      if (urlStr.includes('/api/v1/auth/logout')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'Content-Type': 'application/json' }),
          json: () => Promise.resolve({ status: 'ok' }),
        } as Response);
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: () => Promise.resolve({}),
      } as Response);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('1. Unauthenticated Route Access Protection', () => {
    it('redirects unauthenticated users visiting /dashboard to /auth/login with return URL', async () => {
      renderVerticalSlice(['/dashboard'], null);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument();
      });

      expect(
        screen.getByText(/enter your credentials to access your account/i),
      ).toBeInTheDocument();
    });

    it('redirects unauthenticated users visiting /settings to /auth/login', async () => {
      renderVerticalSlice(['/settings'], null);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument();
      });
    });
  });

  describe('2. Authenticated Dashboard Vertical Slice Composition', () => {
    it('renders complete DashboardLayout shell, Sidebar, Header, and UserMenu when authenticated', async () => {
      renderVerticalSlice(['/dashboard'], VERTICAL_SLICE_USER);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /dashboard overview/i })).toBeInTheDocument();
      });

      // 1. Sidebar Landmark & Navigation Links
      expect(screen.getByLabelText(/main navigation/i)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /settings/i })).toBeInTheDocument();

      // 2. Header Landmark & Breadcrumbs
      expect(screen.getByRole('banner')).toBeInTheDocument();
      expect(screen.getByRole('navigation', { name: /breadcrumb/i })).toBeInTheDocument();

      // 3. UserMenu Trigger Button displaying User Identity
      await waitFor(() => {
        expect(
          screen.getByRole('button', {
            name: /user account menu for lead architect/i,
          }),
        ).toBeInTheDocument();
      });
      expect(screen.getByText('LA')).toBeInTheDocument();
      expect(screen.getByText('Lead Architect')).toBeInTheDocument();
    });

    it('consistently renders currentUser identity details inside UserMenu dropdown panel', async () => {
      renderVerticalSlice(['/dashboard'], VERTICAL_SLICE_USER);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /dashboard overview/i })).toBeInTheDocument();
      });

      let userMenuTrigger!: HTMLElement;
      await waitFor(() => {
        userMenuTrigger = screen.getByRole('button', {
          name: /user account menu for lead architect/i,
        });
        expect(userMenuTrigger).toBeInTheDocument();
      });

      fireEvent.click(userMenuTrigger);

      expect(screen.getByRole('menu', { name: /user account options/i })).toBeInTheDocument();
      expect(screen.getByText('lead.architect@kinergy.io')).toBeInTheDocument();
      expect(screen.getByText('ADMIN')).toBeInTheDocument();
    });

    it('navigates to Settings page via Sidebar link and updates active state', async () => {
      renderVerticalSlice(['/dashboard'], VERTICAL_SLICE_USER);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /dashboard overview/i })).toBeInTheDocument();
      });

      const settingsLink = screen.getByRole('link', { name: /settings/i });
      fireEvent.click(settingsLink);

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { level: 1, name: /platform settings/i }),
        ).toBeInTheDocument();
      });

      expect(settingsLink).toHaveAttribute('aria-current', 'page');
    });
  });

  describe('3. Reactive Logout Flow & Unauthenticated Transition', () => {
    it('executes logout from UserMenu and reactively redirects user to /auth/login', async () => {
      renderVerticalSlice(['/dashboard'], VERTICAL_SLICE_USER);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /dashboard overview/i })).toBeInTheDocument();
      });

      let userMenuTrigger!: HTMLElement;
      await waitFor(() => {
        userMenuTrigger = screen.getByRole('button', {
          name: /user account menu for lead architect/i,
        });
        expect(userMenuTrigger).toBeInTheDocument();
      });
      fireEvent.click(userMenuTrigger);

      const signOutBtn = screen.getByRole('menuitem', { name: /sign out/i });
      expect(signOutBtn).toBeInTheDocument();

      fireEvent.click(signOutBtn);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument();
      });

      expect(
        screen.queryByRole('heading', { name: /dashboard overview/i }),
      ).not.toBeInTheDocument();
    });
  });
});
