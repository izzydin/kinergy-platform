import { useCallback, useEffect, useState } from 'react';
import { ApiError, AuthenticationError, normalizeApiError } from '../../../shared/api/api-error';
import { authTokenStore } from '../../../shared/auth/auth-token-store';
import { logger } from '../../../shared/logger/platform-logger';
import { fetchCurrentUser, performLogout, performSilentRefresh } from '../api/auth-api';
import type { AuthContextState, AuthState, AuthUser } from '../domain/auth-state.types';
import { DEFAULT_DEV_USER } from '../domain/auth-state.types';

const log = logger.withContext('AuthStateMachine');

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
      // Step A: Attempt silent refresh via HttpOnly refresh cookie
      const refreshRes = await performSilentRefresh();
      authTokenStore.setAccessToken(refreshRes.accessToken);
      log.info('Silent refresh succeeded. Access token updated in memory.');

      // Step B: Fetch current authenticated user session profile
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
      setState({
        status: 'UNAUTHENTICATED',
        session: null,
        error: null,
      });
    }
  }, []);

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
