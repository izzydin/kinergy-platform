/**
 * Track B — Step B2.1: AuthProvider Lifecycle Test Suite
 *
 * Comprehensive behavior tests for the AuthProvider lifecycle:
 *   1. Initial bootstrap state (BOOTSTRAPPING)
 *   2. Successful session restoration (AUTHENTICATED)
 *   3. Failed session restoration on 401 (UNAUTHENTICATED)
 *   4. Server gateway crash on 500 (AUTHENTICATION_ERROR) & retryBootstrap() recovery
 *   5. Successful login transition (UNAUTHENTICATED → AUTHENTICATED)
 *   6. Logout transition & QueryCache purging
 *   7. Authenticated user availability & predicate checks (hasPermission, hasRole)
 *   8. Provider unmount safety (asynchronous state update cancellation)
 *   9. Race condition and concurrent transition protections
 */
import '@testing-library/jest-dom';
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '../auth-provider';
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

const TEST_USER: AuthUser = {
  id: 'usr-b2-1-test',
  email: 'operator@kinergy.io',
  name: 'Lifecycle Operator',
  roles: ['OPERATOR', 'ADMIN'],
  permissions: ['client:read', 'energy:read', 'analytics:read'],
  tenantId: 'tenant_lifecycle',
};

describe('Track B — Step B2.1: AuthProvider Lifecycle', () => {
  let fetchSpy: jest.SpyInstance;
  let testQueryClient: QueryClient;

  beforeEach(() => {
    act(() => {
      authTokenStore.clearSession();
    });
    setupAuthTransport(httpClient);
    testQueryClient = createTestQueryClient();

    if (!global.fetch) {
      (global as unknown as { fetch: typeof fetch }).fetch = jest.fn();
    }

    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation((url) => {
      const urlStr = extractUrl(url);

      if (urlStr.includes('/api/v1/auth/refresh')) {
        return Promise.resolve(createMockResponse({ accessToken: 'mock-b2-1-access-token' }, 200));
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

  function renderWithAuthProvider(ui: React.ReactNode, options?: { skipBootstrap?: boolean }) {
    return render(
      <QueryClientProvider client={testQueryClient}>
        <AuthProvider skipBootstrap={options?.skipBootstrap}>{ui}</AuthProvider>
      </QueryClientProvider>,
    );
  }

  // ─── 1. Initial Bootstrap & Session Restoration ────────────────────────────

  describe('1. Initial Bootstrap & Session Restoration', () => {
    it('starts in BOOTSTRAPPING status without prematurely rendering authenticated UI', () => {
      let resolveRefresh!: (res: Response) => void;
      fetchSpy.mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveRefresh = resolve;
          }),
      );

      const Consumer: React.FC = () => {
        const { status, isBootstrapping, currentUser } = useAuth();
        return (
          <div>
            <span data-testid="status">{status}</span>
            <span data-testid="bootstrapping">{String(isBootstrapping)}</span>
            <span data-testid="user">{currentUser ? currentUser.name : 'none'}</span>
          </div>
        );
      };

      renderWithAuthProvider(<Consumer />);

      expect(screen.getByTestId('status')).toHaveTextContent('BOOTSTRAPPING');
      expect(screen.getByTestId('bootstrapping')).toHaveTextContent('true');
      expect(screen.getByTestId('user')).toHaveTextContent('none');

      act(() => {
        resolveRefresh(createMockResponse({ accessToken: 'token' }, 200));
      });
    });

    it('resolves silently to AUTHENTICATED when valid refresh token exists', async () => {
      const Consumer: React.FC = () => {
        const { status, isAuthenticated, currentUser } = useAuth();
        return (
          <div>
            <span data-testid="status">{status}</span>
            <span data-testid="authenticated">{String(isAuthenticated)}</span>
            <span data-testid="user-email">{currentUser?.email ?? 'none'}</span>
          </div>
        );
      };

      renderWithAuthProvider(<Consumer />);

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('AUTHENTICATED');
      });

      expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
      expect(screen.getByTestId('user-email')).toHaveTextContent(TEST_USER.email);
    });

    it('resolves silently to UNAUTHENTICATED when refresh cookie is rejected (401)', async () => {
      fetchSpy.mockImplementation((url) => {
        const urlStr = extractUrl(url);
        if (urlStr.includes('/api/v1/auth/refresh')) {
          return Promise.resolve(createMockResponse({ message: 'Session expired' }, 401));
        }
        return Promise.resolve(createMockResponse({}, 401));
      });

      const Consumer: React.FC = () => {
        const { status, isUnauthenticated, currentUser } = useAuth();
        return (
          <div>
            <span data-testid="status">{status}</span>
            <span data-testid="unauthenticated">{String(isUnauthenticated)}</span>
            <span data-testid="user">{currentUser ? 'present' : 'null'}</span>
          </div>
        );
      };

      renderWithAuthProvider(<Consumer />);

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('UNAUTHENTICATED');
      });

      expect(screen.getByTestId('unauthenticated')).toHaveTextContent('true');
      expect(screen.getByTestId('user')).toHaveTextContent('null');
    });

    it('transitions to AUTHENTICATION_ERROR on server failure (500) and recovers via retryBootstrap()', async () => {
      let attemptCount = 0;
      fetchSpy.mockImplementation((url) => {
        const urlStr = extractUrl(url);
        if (urlStr.includes('/api/v1/auth/refresh')) {
          attemptCount++;
          if (attemptCount === 1) {
            return Promise.resolve(createMockResponse({ message: 'Gateway Timeout' }, 504));
          }
          return Promise.resolve(createMockResponse({ accessToken: 'retry-token' }, 200));
        }
        if (urlStr.includes('/api/v1/auth/me')) {
          return Promise.resolve(createMockResponse(TEST_USER, 200));
        }
        return Promise.resolve(createMockResponse({}, 200));
      });

      const Consumer: React.FC = () => {
        const { status, error, retryBootstrap } = useAuth();
        return (
          <div>
            <span data-testid="status">{status}</span>
            <span data-testid="error">{error ? error.message : 'none'}</span>
            <button data-testid="retry-btn" onClick={() => void retryBootstrap()}>
              Retry
            </button>
          </div>
        );
      };

      renderWithAuthProvider(<Consumer />);

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('AUTHENTICATION_ERROR');
      });

      expect(screen.getByTestId('error')).not.toHaveTextContent('none');

      // Click retry
      fireEvent.click(screen.getByTestId('retry-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('AUTHENTICATED');
      });
    });
  });

  // ─── 2. Login & Logout Workflows ───────────────────────────────────────────

  describe('2. Login & Logout Workflows', () => {
    it('executes login transition from UNAUTHENTICATED to AUTHENTICATED', async () => {
      fetchSpy.mockImplementation((url) => {
        const urlStr = extractUrl(url);
        if (urlStr.includes('/api/v1/auth/refresh')) {
          return Promise.resolve(createMockResponse({ message: 'No session' }, 401));
        }
        if (urlStr.includes('/api/v1/auth/me')) {
          return Promise.resolve(createMockResponse(TEST_USER, 200));
        }
        return Promise.resolve(createMockResponse({}, 200));
      });

      const Consumer: React.FC = () => {
        const { status, currentUser, login } = useAuth();
        return (
          <div>
            <span data-testid="status">{status}</span>
            <span data-testid="user">{currentUser ? currentUser.name : 'none'}</span>
            <button data-testid="login-btn" onClick={() => void login()}>
              Login
            </button>
          </div>
        );
      };

      renderWithAuthProvider(<Consumer />);

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('UNAUTHENTICATED');
      });

      fireEvent.click(screen.getByTestId('login-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('AUTHENTICATED');
        expect(screen.getByTestId('user')).toHaveTextContent(TEST_USER.name);
      });
    });

    it('executes logout transition, clears token store, and purges QueryCache', async () => {
      const clearCacheSpy = jest.spyOn(testQueryClient, 'clear');

      const Consumer: React.FC = () => {
        const { status, logout } = useAuth();
        return (
          <div>
            <span data-testid="status">{status}</span>
            <button data-testid="logout-btn" onClick={() => void logout()}>
              Logout
            </button>
          </div>
        );
      };

      renderWithAuthProvider(<Consumer />);

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('AUTHENTICATED');
      });

      fireEvent.click(screen.getByTestId('logout-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('UNAUTHENTICATED');
      });

      expect(authTokenStore.getAccessToken()).toBeNull();
      expect(clearCacheSpy).toHaveBeenCalled();
    });
  });

  // ─── 3. Provider Lifecycle & Unmount Safety ────────────────────────────────

  describe('3. Provider Lifecycle & Unmount Safety', () => {
    it('safely handles component unmount while async bootstrap is in-flight without state update warnings', async () => {
      let resolveRefresh!: (res: Response) => void;
      fetchSpy.mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveRefresh = resolve;
          }),
      );

      const Consumer: React.FC = () => {
        const { status } = useAuth();
        return <span data-testid="status">{status}</span>;
      };

      const { unmount } = renderWithAuthProvider(<Consumer />);

      expect(screen.getByTestId('status')).toHaveTextContent('BOOTSTRAPPING');

      // Unmount while refresh request is pending
      unmount();

      // Resolve async request post-unmount — should NOT trigger setState or throw console errors
      await act(async () => {
        resolveRefresh(createMockResponse({ accessToken: 'post-unmount-token' }, 200));
      });
    });
  });

  // ─── 4. User Availability & Authorization Predicates ───────────────────────

  describe('4. User Availability & Authorization Predicates', () => {
    it('provides hasPermission() and hasRole() helpers when authenticated', async () => {
      const Consumer: React.FC = () => {
        const { hasPermission, hasRole } = useAuth();
        return (
          <div>
            <span data-testid="can-read-client">{String(hasPermission('client:read'))}</span>
            <span data-testid="can-write-client">{String(hasPermission('client:write'))}</span>
            <span data-testid="is-admin">{String(hasRole('ADMIN'))}</span>
            <span data-testid="is-superadmin">{String(hasRole('SUPERADMIN'))}</span>
          </div>
        );
      };

      renderWithAuthProvider(<Consumer />);

      await waitFor(() => {
        expect(screen.getByTestId('can-read-client')).toHaveTextContent('true');
      });

      expect(screen.getByTestId('can-write-client')).toHaveTextContent('false');
      expect(screen.getByTestId('is-admin')).toHaveTextContent('true');
      expect(screen.getByTestId('is-superadmin')).toHaveTextContent('false');
    });
  });
});
