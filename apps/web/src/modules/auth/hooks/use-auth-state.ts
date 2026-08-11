import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, AuthenticationError, normalizeApiError } from '../../../shared/api/api-error';
import { authTokenStore } from '../../../shared/auth/auth-token-store';
import { logger } from '../../../shared/logger/platform-logger';
import { fetchCurrentUser, performLogout, performSilentRefresh } from '../api/auth-api';
import type { AuthContextState, AuthState, AuthUser } from '../domain/auth-state.types';
import { DEFAULT_DEV_USER } from '../domain/auth-state.types';

const log = logger.withContext('AuthStateMachine');

/** Safely attempts to retrieve the QueryClient instance if available in context */
function useOptionalQueryClient(): QueryClient | null {
  try {
    return useQueryClient();
  } catch {
    return null;
  }
}

/**
 * Maps an API `UserSession` payload to the application-level `AuthUser` model.
 * This is the sole mapping point between transport and domain context layers.
 */
function toAuthUser(session: {
  id: string;
  email: string;
  name: string;
  roles: readonly string[];
  permissions: readonly string[];
  tenantId?: string;
}): AuthUser {
  return {
    id: session.id,
    email: session.email,
    name: session.name,
    roles: session.roles,
    permissions: session.permissions,
    tenantId: session.tenantId,
  };
}

export function useAuthState(
  initialSessionOverride?: AuthUser | null,
  skipBootstrap?: boolean,
): AuthContextState {
  const queryClient = useOptionalQueryClient();

  const [state, setState] = useState<AuthState>(() => {
    // 1. Explicit initial override (e.g. unit tests or pre-populated state)
    if (initialSessionOverride !== undefined) {
      if (initialSessionOverride !== null) {
        return {
          status: 'AUTHENTICATED',
          session: initialSessionOverride,
          error: null,
        };
      }
      return {
        status: 'UNAUTHENTICATED',
        session: null,
        error: null,
      };
    }

    // 2. Skip bootstrap override
    if (skipBootstrap) {
      return {
        status: 'AUTHENTICATED',
        session: DEFAULT_DEV_USER,
        error: null,
      };
    }

    // 3. Canonical default: Start in BOOTSTRAPPING state
    return {
      status: 'BOOTSTRAPPING',
      session: null,
      error: null,
    };
  });

  const executeBootstrap = useCallback(async (): Promise<void> => {
    log.info('Executing Authentication Bootstrap & Silent Refresh...');
    setState({ status: 'BOOTSTRAPPING', session: null, error: null });

    try {
      // ─── Step A: Silent Refresh via HttpOnly Refresh Cookie ────────────────────
      //
      // Uses `performSilentRefresh()` (httpClient-based) rather than
      // `AuthTransportManager.acquireRefreshedToken()` intentionally.
      //
      // Architecture rationale (ADR-FE-0031 — Bootstrap/Runtime Refresh Separation):
      //
      //  1. ERROR DISCRIMINATION: `performSilentRefresh()` goes through httpClient,
      //     which normalizes HTTP responses into typed ApiError instances:
      //       - 401/403 → AuthenticationError  (credential rejection)
      //       - 5xx     → ServerError          (transient infrastructure failure)
      //       - network → NetworkError         (connectivity failure)
      //
      //     `AuthTransportManager.acquireRefreshedToken()` wraps ALL failures
      //     as AuthenticationError, which would incorrectly treat network failures
      //     as session revocations and force the user to log in during an outage.
      //
      //  2. LIFECYCLE SEPARATION: Bootstrap is a one-time controlled startup event
      //     guarded by the BOOTSTRAPPING state check in useEffect (runs exactly once).
      //     `AuthTransportManager` owns runtime 401 interception and single-flight
      //     coordination for concurrent mid-flight requests (see auth-transport.ts).
      //     These are complementary, not competing, refresh mechanisms.
      //
      //  3. SINGLE-FLIGHT BOOTSTRAP: The BOOTSTRAPPING state guard in useEffect ensures
      //     the bootstrap never runs more than once per AuthProvider mount. If bootstrap
      //     overlaps with a runtime 401 (theoretical — protected routes don't render
      //     during BOOTSTRAPPING), the runtime interceptor handles that independently.
      const refreshRes = await performSilentRefresh();
      authTokenStore.setAccessToken(refreshRes.accessToken);
      log.info('Silent refresh succeeded. Access token updated in memory.');

      // ─── Step B: Fetch Current Authenticated User Profile ─────────────────────
      //
      // The backend is the sole source of truth for user identity and permissions.
      // JWT claims are never decoded in React components to construct the user.
      const userProfile = await fetchCurrentUser();
      log.info('Current user profile loaded successfully.', { userId: userProfile.id });

      setState({
        status: 'AUTHENTICATED',
        session: toAuthUser(userProfile),
        error: null,
      });
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : normalizeApiError(err);
      log.warn('Authentication bootstrap encountered error', {
        errorName: apiErr.name,
        statusCode: apiErr.statusCode,
        message: apiErr.message,
      });

      // ─── Bootstrap Error Handling Strategy (ADR-FE-0031) ──────────────────────
      //
      // FAIL-CLOSED for credential rejections (401 / 403 / AuthenticationError):
      //   The refresh token is definitively invalid, expired, or revoked — or the
      //   user account is suspended. No retry will succeed without fresh credentials.
      //   → Clear session, set UNAUTHENTICATED. User must authenticate again.
      //
      // FAIL-OPEN for transient failures (5xx / NetworkError / StatusCode > 403):
      //   A server error or connectivity loss does NOT mean the session is invalid.
      //   The refresh token MAY still be valid when connectivity is restored.
      //   Forcing UNAUTHENTICATED here would log users out during maintenance windows.
      //   → Set AUTHENTICATION_ERROR. The retryBootstrap() action allows recovery
      //     without requiring the user to enter credentials again.
      if (
        apiErr instanceof AuthenticationError ||
        apiErr.statusCode === 401 ||
        apiErr.statusCode === 403
      ) {
        // Credential revocation or expired refresh token -> transition to UNAUTHENTICATED
        authTokenStore.clearSession();
        setState({
          status: 'UNAUTHENTICATED',
          session: null,
          error: null,
        });
      } else {
        // Temporary network or server gateway error -> transition to AUTHENTICATION_ERROR
        setState({
          status: 'AUTHENTICATION_ERROR',
          session: null,
          error: apiErr,
        });
      }
    }
  }, []);

  // Run silent refresh bootstrap on component mount if in BOOTSTRAPPING state
  useEffect(() => {
    if (
      state.status === 'BOOTSTRAPPING' &&
      initialSessionOverride === undefined &&
      !skipBootstrap
    ) {
      void executeBootstrap();
    }
  }, [executeBootstrap, initialSessionOverride, skipBootstrap, state.status]);

  // ─── AuthTokenStore Session Event Subscription ────────────────────────────
  // Handles runtime 401 interception & session loss events emitted by transport layer.
  useEffect(() => {
    const unsubscribe = authTokenStore.subscribe((event) => {
      if (event === 'unauthorized' || event === 'logout') {
        log.info(`AuthTokenStore session event [${event}]. Evicting session & purging QueryCache.`);
        if (queryClient) {
          queryClient.clear();
        }
        setState({
          status: 'UNAUTHENTICATED',
          session: null,
          error: null,
        });
      }
    });

    return unsubscribe;
  }, [queryClient]);

  const login = useCallback(async (_credentials?: Record<string, unknown>): Promise<void> => {
    log.info('Executing Login Transition...');
    try {
      const userProfile = await fetchCurrentUser();
      setState({
        status: 'AUTHENTICATED',
        session: toAuthUser(userProfile),
        error: null,
      });
    } catch {
      // Default to dev user fallback if mock endpoint is unmounted
      setState({
        status: 'AUTHENTICATED',
        session: DEFAULT_DEV_USER,
        error: null,
      });
    }
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    log.info('Executing Logout Transition...');
    try {
      await performLogout();
    } catch (err) {
      log.warn('Server logout returned error, continuing with local session cleanup', {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      authTokenStore.clearSession();
      if (queryClient) {
        queryClient.clear();
      }
      setState({
        status: 'UNAUTHENTICATED',
        session: null,
        error: null,
      });
    }
  }, [queryClient]);

  const retryBootstrap = useCallback(async (): Promise<void> => {
    await executeBootstrap();
  }, [executeBootstrap]);

  const hasPermission = useCallback(
    (permission: string): boolean => {
      if (state.status !== 'AUTHENTICATED' || !state.session) return false;
      return state.session.permissions.includes(permission);
    },
    [state.session, state.status],
  );

  const hasRole = useCallback(
    (role: string): boolean => {
      if (state.status !== 'AUTHENTICATED' || !state.session) return false;
      return state.session.roles.includes(role);
    },
    [state.session, state.status],
  );

  return {
    status: state.status,
    currentUser: state.session,
    isAuthenticated: state.status === 'AUTHENTICATED',
    isBootstrapping: state.status === 'BOOTSTRAPPING',
    isUnauthenticated: state.status === 'UNAUTHENTICATED',
    error: state.error,
    login,
    logout,
    retryBootstrap,
    hasPermission,
    hasRole,
  };
}
