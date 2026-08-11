/**
 * Track B — Milestone B1.1: Authentication State & AuthProvider
 *
 * Dedicated AuthProvider contract test suite.
 *
 * Coverage:
 *   1. Initial bootstrapping state
 *   2. Authenticated state (after successful bootstrap)
 *   3. Unauthenticated state (after 401 bootstrap failure)
 *   4. User availability (currentUser populated / null)
 *   5. Logout transition
 *   6. Full state lifecycle transitions
 *   7. Provider behavior (context shape, boolean flags)
 *   8. Consumer outside AuthProvider boundary
 *   9. hasPermission / hasRole predicates
 *  10. initialSessionOverride — bypasses bootstrap
 *  11. skipBootstrap — resolves immediately with dev user
 *  12. Token non-exposure — context does not expose raw tokens
 */
import '@testing-library/jest-dom';
import React from 'react';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '../auth-provider';
import { authTokenStore } from '../../../shared/auth/auth-token-store';
import { setupAuthTransport } from '../../../shared/auth/auth-transport';
import { httpClient } from '../../../shared/api/http-client';
import type { AuthUser } from '../../../modules/auth/domain/auth-state.types';
import { DEFAULT_DEV_USER } from '../../../modules/auth/domain/auth-state.types';

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

const MOCK_AUTH_USER: AuthUser = {
  id: 'usr-b1-1-test',
  email: 'architect@kinergy.io',
  name: 'Lead Architect',
  roles: ['ADMIN'],
  permissions: ['client:read', 'energy:read', 'analytics:read', 'admin:read'],
  tenantId: 'tenant_test',
};

interface WrapperProps {
  initialSessionOverride?: AuthUser | null;
  skipBootstrap?: boolean;
  children: React.ReactNode;
}

const AuthTestWrapper: React.FC<WrapperProps> = ({
  initialSessionOverride,
  skipBootstrap,
  children,
}) => (
  <QueryClientProvider client={createTestQueryClient()}>
    <AuthProvider initialSessionOverride={initialSessionOverride} skipBootstrap={skipBootstrap}>
      {children}
    </AuthProvider>
  </QueryClientProvider>
);

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Track B — Milestone B1.1: AuthProvider Contract', () => {
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
          createMockResponse({ accessToken: 'mock-b1-1-access-token', expiresIn: 900 }, 200),
        );
      }
      if (urlStr.includes('/api/v1/auth/me')) {
        return Promise.resolve(createMockResponse(MOCK_AUTH_USER, 200));
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

  // ─── 1. Initial Bootstrapping State ────────────────────────────────────────

  describe('1. Initial Bootstrapping State', () => {
    it('starts in BOOTSTRAPPING status before async operations complete', () => {
      // Prevent the bootstrap from resolving during this test
      let resolveRefresh!: (res: Response) => void;
      const pendingRefresh = new Promise<Response>((res) => {
        resolveRefresh = res;
      });
      fetchSpy.mockImplementationOnce(() => pendingRefresh);

      const StatusConsumer: React.FC = () => {
        const { status, isBootstrapping, currentUser } = useAuth();
        return (
          <div>
            <span data-testid="status">{status}</span>
            <span data-testid="is-bootstrapping">{String(isBootstrapping)}</span>
            <span data-testid="current-user">{currentUser?.name ?? 'null'}</span>
          </div>
        );
      };

      render(
        <AuthTestWrapper>
          <StatusConsumer />
        </AuthTestWrapper>,
      );

      expect(screen.getByTestId('status')).toHaveTextContent('BOOTSTRAPPING');
      expect(screen.getByTestId('is-bootstrapping')).toHaveTextContent('true');
      expect(screen.getByTestId('current-user')).toHaveTextContent('null');

      // Clean up — resolve the pending fetch to avoid open handles
      act(() => {
        resolveRefresh(createMockResponse({ accessToken: 'cleanup-token' }, 200));
      });
    });

    it('isBootstrapping is true and isAuthenticated/isUnauthenticated are false during bootstrap', () => {
      let resolveRefresh!: (res: Response) => void;
      const pendingRefresh = new Promise<Response>((res) => {
        resolveRefresh = res;
      });
      fetchSpy.mockImplementationOnce(() => pendingRefresh);

      const FlagsConsumer: React.FC = () => {
        const { isBootstrapping, isAuthenticated, isUnauthenticated } = useAuth();
        return (
          <div>
            <span data-testid="is-bootstrapping">{String(isBootstrapping)}</span>
            <span data-testid="is-authenticated">{String(isAuthenticated)}</span>
            <span data-testid="is-unauthenticated">{String(isUnauthenticated)}</span>
          </div>
        );
      };

      render(
        <AuthTestWrapper>
          <FlagsConsumer />
        </AuthTestWrapper>,
      );

      expect(screen.getByTestId('is-bootstrapping')).toHaveTextContent('true');
      expect(screen.getByTestId('is-authenticated')).toHaveTextContent('false');
      expect(screen.getByTestId('is-unauthenticated')).toHaveTextContent('false');

      act(() => {
        resolveRefresh(createMockResponse({ accessToken: 'cleanup-token' }, 200));
      });
    });
  });

  // ─── 2. Authenticated State ─────────────────────────────────────────────────

  describe('2. Authenticated State', () => {
    it('transitions to AUTHENTICATED after successful silent refresh', async () => {
      const StatusConsumer: React.FC = () => {
        const { status, isAuthenticated } = useAuth();
        return (
          <div>
            <span data-testid="status">{status}</span>
            <span data-testid="is-authenticated">{String(isAuthenticated)}</span>
          </div>
        );
      };

      render(
        <AuthTestWrapper>
          <StatusConsumer />
        </AuthTestWrapper>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('AUTHENTICATED');
      });

      expect(screen.getByTestId('is-authenticated')).toHaveTextContent('true');
    });

    it('exposes correct AuthUser shape when authenticated', async () => {
      const UserConsumer: React.FC = () => {
        const { currentUser } = useAuth();
        if (!currentUser) return <span data-testid="user">null</span>;
        return (
          <div>
            <span data-testid="user-id">{currentUser.id}</span>
            <span data-testid="user-email">{currentUser.email}</span>
            <span data-testid="user-name">{currentUser.name}</span>
            <span data-testid="user-roles">{currentUser.roles.join(',')}</span>
          </div>
        );
      };

      render(
        <AuthTestWrapper>
          <UserConsumer />
        </AuthTestWrapper>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('user-id')).toHaveTextContent(MOCK_AUTH_USER.id);
      });

      expect(screen.getByTestId('user-email')).toHaveTextContent(MOCK_AUTH_USER.email);
      expect(screen.getByTestId('user-name')).toHaveTextContent(MOCK_AUTH_USER.name);
      expect(screen.getByTestId('user-roles')).toHaveTextContent('ADMIN');
    });
  });

  // ─── 3. Unauthenticated State ───────────────────────────────────────────────

  describe('3. Unauthenticated State', () => {
    it('transitions to UNAUTHENTICATED when silent refresh fails with 401', async () => {
      fetchSpy.mockImplementation((url) => {
        const urlStr = extractUrl(url);
        if (urlStr.includes('/api/v1/auth/refresh')) {
          return Promise.resolve(
            createMockResponse({ message: 'Refresh token expired', statusCode: 401 }, 401),
          );
        }
        return Promise.resolve(createMockResponse({}, 401));
      });

      const StatusConsumer: React.FC = () => {
        const { status, isUnauthenticated } = useAuth();
        return (
          <div>
            <span data-testid="status">{status}</span>
            <span data-testid="is-unauthenticated">{String(isUnauthenticated)}</span>
          </div>
        );
      };

      render(
        <AuthTestWrapper>
          <StatusConsumer />
        </AuthTestWrapper>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('UNAUTHENTICATED');
      });

      expect(screen.getByTestId('is-unauthenticated')).toHaveTextContent('true');
    });
  });

  // ─── 4. User Availability ───────────────────────────────────────────────────

  describe('4. User Availability', () => {
    it('currentUser is non-null only when AUTHENTICATED', async () => {
      const UserConsumer: React.FC = () => {
        const { currentUser, isAuthenticated } = useAuth();
        return (
          <div>
            <span data-testid="has-user">{String(currentUser !== null)}</span>
            <span data-testid="is-authenticated">{String(isAuthenticated)}</span>
          </div>
        );
      };

      render(
        <AuthTestWrapper>
          <UserConsumer />
        </AuthTestWrapper>,
      );

      // Initially no user during bootstrap
      expect(screen.getByTestId('has-user')).toHaveTextContent('false');

      await waitFor(() => {
        expect(screen.getByTestId('is-authenticated')).toHaveTextContent('true');
      });

      expect(screen.getByTestId('has-user')).toHaveTextContent('true');
    });

    it('currentUser is null when UNAUTHENTICATED', async () => {
      fetchSpy.mockImplementation((url) => {
        const urlStr = extractUrl(url);
        if (urlStr.includes('/api/v1/auth/refresh')) {
          return Promise.resolve(createMockResponse({ message: 'No session' }, 401));
        }
        return Promise.resolve(createMockResponse({}, 401));
      });

      const UserConsumer: React.FC = () => {
        const { currentUser, status } = useAuth();
        return (
          <div>
            <span data-testid="status">{status}</span>
            <span data-testid="has-user">{String(currentUser !== null)}</span>
          </div>
        );
      };

      render(
        <AuthTestWrapper>
          <UserConsumer />
        </AuthTestWrapper>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('UNAUTHENTICATED');
      });

      expect(screen.getByTestId('has-user')).toHaveTextContent('false');
    });
  });

  // ─── 5. Logout ──────────────────────────────────────────────────────────────

  describe('5. Logout', () => {
    it('logout() transitions to UNAUTHENTICATED and clears the in-memory token', async () => {
      const LogoutConsumer: React.FC = () => {
        const { status, currentUser, logout } = useAuth();
        return (
          <div>
            <span data-testid="status">{status}</span>
            <span data-testid="has-user">{String(currentUser !== null)}</span>
            <button data-testid="logout-btn" onClick={() => void logout()}>
              Logout
            </button>
          </div>
        );
      };

      render(
        <AuthTestWrapper>
          <LogoutConsumer />
        </AuthTestWrapper>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('AUTHENTICATED');
      });
      expect(screen.getByTestId('has-user')).toHaveTextContent('true');

      fireEvent.click(screen.getByTestId('logout-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('UNAUTHENTICATED');
      });

      expect(screen.getByTestId('has-user')).toHaveTextContent('false');
      expect(authTokenStore.getAccessToken()).toBeNull();
    });

    it('logout() clears session even when the server-side logout call fails', async () => {
      fetchSpy.mockImplementation((url) => {
        const urlStr = extractUrl(url);
        if (urlStr.includes('/api/v1/auth/refresh')) {
          return Promise.resolve(createMockResponse({ accessToken: 'token-before-logout' }, 200));
        }
        if (urlStr.includes('/api/v1/auth/me')) {
          return Promise.resolve(createMockResponse(MOCK_AUTH_USER, 200));
        }
        if (urlStr.includes('/api/v1/auth/logout')) {
          return Promise.resolve(createMockResponse({ message: 'Server error' }, 500));
        }
        return Promise.resolve(createMockResponse({}, 200));
      });

      const LogoutConsumer: React.FC = () => {
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

      render(
        <AuthTestWrapper>
          <LogoutConsumer />
        </AuthTestWrapper>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('AUTHENTICATED');
      });

      fireEvent.click(screen.getByTestId('logout-btn'));

      // Even on server-side failure, local state must clear
      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('UNAUTHENTICATED');
      });

      expect(authTokenStore.getAccessToken()).toBeNull();
    });
  });

  // ─── 6. State Lifecycle Transitions ─────────────────────────────────────────

  describe('6. State Lifecycle Transitions', () => {
    it('transitions BOOTSTRAPPING → AUTHENTICATED → UNAUTHENTICATED in sequence', async () => {
      const states: string[] = [];

      const TransitionConsumer: React.FC = () => {
        const { status, logout } = useAuth();

        React.useEffect(() => {
          states.push(status);
        }, [status]);

        return (
          <div>
            <span data-testid="status">{status}</span>
            <button data-testid="logout-btn" onClick={() => void logout()}>
              Logout
            </button>
          </div>
        );
      };

      render(
        <AuthTestWrapper>
          <TransitionConsumer />
        </AuthTestWrapper>,
      );

      // Start in BOOTSTRAPPING
      expect(screen.getByTestId('status')).toHaveTextContent('BOOTSTRAPPING');

      // Transition to AUTHENTICATED
      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('AUTHENTICATED');
      });

      // Trigger logout
      fireEvent.click(screen.getByTestId('logout-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('UNAUTHENTICATED');
      });

      expect(states).toContain('BOOTSTRAPPING');
      expect(states).toContain('AUTHENTICATED');
      expect(states).toContain('UNAUTHENTICATED');
    });
  });

  // ─── 7. Provider Behavior ────────────────────────────────────────────────────

  describe('7. Provider Behavior', () => {
    it('provides a stable context value with all required AuthContextState fields', async () => {
      let capturedContext: ReturnType<typeof useAuth> | undefined;

      const Inspector: React.FC = () => {
        capturedContext = useAuth();
        return null;
      };

      render(
        <AuthTestWrapper>
          <Inspector />
        </AuthTestWrapper>,
      );

      await waitFor(() => {
        expect(capturedContext?.status).toBe('AUTHENTICATED');
      });

      expect(capturedContext).toMatchObject({
        status: 'AUTHENTICATED',
        isAuthenticated: true,
        isBootstrapping: false,
        isUnauthenticated: false,
        error: null,
      });

      expect(typeof capturedContext?.login).toBe('function');
      expect(typeof capturedContext?.logout).toBe('function');
      expect(typeof capturedContext?.retryBootstrap).toBe('function');
      expect(typeof capturedContext?.hasPermission).toBe('function');
      expect(typeof capturedContext?.hasRole).toBe('function');
      expect(capturedContext?.currentUser).not.toBeNull();
    });

    it('does not expose raw token values through the context', async () => {
      let capturedContext: ReturnType<typeof useAuth> | undefined;

      const Inspector: React.FC = () => {
        capturedContext = useAuth();
        return null;
      };

      render(
        <AuthTestWrapper>
          <Inspector />
        </AuthTestWrapper>,
      );

      await waitFor(() => {
        expect(capturedContext?.status).toBe('AUTHENTICATED');
      });

      // The context value should not contain any raw token strings
      const contextJson = JSON.stringify(capturedContext, (_key, value) =>
        typeof value === 'function' ? '[Function]' : value,
      );

      expect(contextJson).not.toContain('mock-b1-1-access-token');
      expect(contextJson).not.toContain('Bearer ');
      expect(contextJson).not.toContain('accessToken');
    });

    it('multiple consumers within the same AuthProvider share the same context instance', async () => {
      const statusValues: string[] = [];

      const ConsumerA: React.FC = () => {
        const { status } = useAuth();
        statusValues.push(`A:${status}`);
        return <span data-testid="a">{status}</span>;
      };

      const ConsumerB: React.FC = () => {
        const { status } = useAuth();
        statusValues.push(`B:${status}`);
        return <span data-testid="b">{status}</span>;
      };

      render(
        <AuthTestWrapper>
          <ConsumerA />
          <ConsumerB />
        </AuthTestWrapper>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('a')).toHaveTextContent('AUTHENTICATED');
      });

      expect(screen.getByTestId('b')).toHaveTextContent('AUTHENTICATED');
    });
  });

  // ─── 8. Consumer Outside Provider ───────────────────────────────────────────

  describe('8. Consumer Outside Provider', () => {
    it('useAuth() throws a descriptive error when called outside AuthProvider', () => {
      const OutsideConsumer: React.FC = () => {
        useAuth(); // Should throw
        return null;
      };

      // Suppress React's uncaught error output in test console
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

      expect(() => {
        render(<OutsideConsumer />);
      }).toThrow('useAuth must be used within an AuthProvider');

      consoleError.mockRestore();
    });

    it('useAuth() error message is descriptive enough to diagnose the misconfiguration', () => {
      const TestConsumer: React.FC = () => {
        useAuth();
        return null;
      };

      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

      let thrownError: Error | undefined;
      try {
        render(<TestConsumer />);
      } catch (err) {
        thrownError = err as Error;
      }

      expect(thrownError).toBeInstanceOf(Error);
      expect(thrownError?.message).toMatch(/AuthProvider/);

      consoleError.mockRestore();
    });

    it('useAuth() works correctly in renderHook when wrapped in AuthProvider', async () => {
      const queryClient = createTestQueryClient();

      const { result } = renderHook(() => useAuth(), {
        wrapper: ({ children }) => (
          <QueryClientProvider client={queryClient}>
            <AuthProvider>{children}</AuthProvider>
          </QueryClientProvider>
        ),
      });

      // Initial state is BOOTSTRAPPING
      expect(result.current.status).toBe('BOOTSTRAPPING');

      await waitFor(() => {
        expect(result.current.status).toBe('AUTHENTICATED');
      });

      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.currentUser).not.toBeNull();
    });
  });

  // ─── 9. hasPermission / hasRole Predicates ──────────────────────────────────

  describe('9. hasPermission / hasRole Predicates', () => {
    it('hasPermission() returns true for a permission the authenticated user holds', async () => {
      const PermConsumer: React.FC = () => {
        const { hasPermission, status } = useAuth();
        return (
          <div>
            <span data-testid="status">{status}</span>
            <span data-testid="has-client-read">{String(hasPermission('client:read'))}</span>
            <span data-testid="has-admin-write">{String(hasPermission('admin:write'))}</span>
          </div>
        );
      };

      render(
        <AuthTestWrapper>
          <PermConsumer />
        </AuthTestWrapper>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('AUTHENTICATED');
      });

      expect(screen.getByTestId('has-client-read')).toHaveTextContent('true');
      expect(screen.getByTestId('has-admin-write')).toHaveTextContent('false');
    });

    it('hasRole() returns true for a role the authenticated user holds', async () => {
      const RoleConsumer: React.FC = () => {
        const { hasRole, status } = useAuth();
        return (
          <div>
            <span data-testid="status">{status}</span>
            <span data-testid="has-admin">{String(hasRole('ADMIN'))}</span>
            <span data-testid="has-superadmin">{String(hasRole('SUPERADMIN'))}</span>
          </div>
        );
      };

      render(
        <AuthTestWrapper>
          <RoleConsumer />
        </AuthTestWrapper>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('AUTHENTICATED');
      });

      expect(screen.getByTestId('has-admin')).toHaveTextContent('true');
      expect(screen.getByTestId('has-superadmin')).toHaveTextContent('false');
    });

    it('hasPermission() and hasRole() return false when UNAUTHENTICATED', async () => {
      fetchSpy.mockImplementation((url) => {
        const urlStr = extractUrl(url);
        if (urlStr.includes('/api/v1/auth/refresh')) {
          return Promise.resolve(createMockResponse({ message: 'No session' }, 401));
        }
        return Promise.resolve(createMockResponse({}, 401));
      });

      const PredicateConsumer: React.FC = () => {
        const { hasPermission, hasRole, status } = useAuth();
        return (
          <div>
            <span data-testid="status">{status}</span>
            <span data-testid="has-perm">{String(hasPermission('client:read'))}</span>
            <span data-testid="has-role">{String(hasRole('ADMIN'))}</span>
          </div>
        );
      };

      render(
        <AuthTestWrapper>
          <PredicateConsumer />
        </AuthTestWrapper>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('UNAUTHENTICATED');
      });

      expect(screen.getByTestId('has-perm')).toHaveTextContent('false');
      expect(screen.getByTestId('has-role')).toHaveTextContent('false');
    });
  });

  // ─── 10. initialSessionOverride ─────────────────────────────────────────────

  describe('10. initialSessionOverride', () => {
    it('starts in AUTHENTICATED state when a non-null session override is provided', () => {
      const overrideUser: AuthUser = {
        id: 'usr-override',
        email: 'override@kinergy.io',
        name: 'Override User',
        roles: ['VIEWER'],
        permissions: ['client:read'],
      };

      const StatusConsumer: React.FC = () => {
        const { status, currentUser } = useAuth();
        return (
          <div>
            <span data-testid="status">{status}</span>
            <span data-testid="user-name">{currentUser?.name ?? 'null'}</span>
          </div>
        );
      };

      render(
        <AuthTestWrapper initialSessionOverride={overrideUser}>
          <StatusConsumer />
        </AuthTestWrapper>,
      );

      // Immediately AUTHENTICATED — no async bootstrap
      expect(screen.getByTestId('status')).toHaveTextContent('AUTHENTICATED');
      expect(screen.getByTestId('user-name')).toHaveTextContent('Override User');

      // Network should not have been called
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('starts in UNAUTHENTICATED state when initialSessionOverride is null', () => {
      const StatusConsumer: React.FC = () => {
        const { status, currentUser } = useAuth();
        return (
          <div>
            <span data-testid="status">{status}</span>
            <span data-testid="has-user">{String(currentUser !== null)}</span>
          </div>
        );
      };

      render(
        <AuthTestWrapper initialSessionOverride={null}>
          <StatusConsumer />
        </AuthTestWrapper>,
      );

      expect(screen.getByTestId('status')).toHaveTextContent('UNAUTHENTICATED');
      expect(screen.getByTestId('has-user')).toHaveTextContent('false');
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  // ─── 11. skipBootstrap ──────────────────────────────────────────────────────

  describe('11. skipBootstrap', () => {
    it('resolves immediately as AUTHENTICATED with DEFAULT_DEV_USER when skipBootstrap=true', () => {
      const StatusConsumer: React.FC = () => {
        const { status, currentUser } = useAuth();
        return (
          <div>
            <span data-testid="status">{status}</span>
            <span data-testid="user-id">{currentUser?.id ?? 'null'}</span>
          </div>
        );
      };

      render(
        <AuthTestWrapper skipBootstrap>
          <StatusConsumer />
        </AuthTestWrapper>,
      );

      // Immediately AUTHENTICATED with no network calls
      expect(screen.getByTestId('status')).toHaveTextContent('AUTHENTICATED');
      expect(screen.getByTestId('user-id')).toHaveTextContent(DEFAULT_DEV_USER.id);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  // ─── 12. Token Non-Exposure ──────────────────────────────────────────────────

  describe('12. Token Non-Exposure', () => {
    it('the access token set in authTokenStore is never present in the context value', async () => {
      let capturedContext: ReturnType<typeof useAuth> | undefined;

      const Inspector: React.FC = () => {
        capturedContext = useAuth();
        return null;
      };

      render(
        <AuthTestWrapper>
          <Inspector />
        </AuthTestWrapper>,
      );

      await waitFor(() => {
        expect(capturedContext?.status).toBe('AUTHENTICATED');
      });

      // Verify the token was stored in the token store
      expect(authTokenStore.getAccessToken()).toBe('mock-b1-1-access-token');

      // Verify the context value does NOT contain the raw token
      const contextEntries = Object.entries(capturedContext ?? {});
      for (const [, value] of contextEntries) {
        if (typeof value === 'string') {
          expect(value).not.toBe('mock-b1-1-access-token');
          expect(value).not.toMatch(/^Bearer /);
        }
      }
    });

    it('currentUser does not carry token or secret fields', async () => {
      let capturedUser: AuthUser | null | undefined;

      const Inspector: React.FC = () => {
        const { currentUser, status } = useAuth();
        if (status === 'AUTHENTICATED') capturedUser = currentUser;
        return null;
      };

      render(
        <AuthTestWrapper>
          <Inspector />
        </AuthTestWrapper>,
      );

      await waitFor(() => {
        expect(capturedUser).not.toBeUndefined();
      });

      const userJson = JSON.stringify(capturedUser);
      expect(userJson).not.toContain('token');
      expect(userJson).not.toContain('password');
      expect(userJson).not.toContain('secret');
      expect(userJson).not.toContain('Bearer');
    });
  });
});
