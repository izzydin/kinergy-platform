import { useMutation } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import {
  ApiError,
  AuthenticationError,
  ValidationError,
  normalizeApiError,
} from '../../../../shared/api/api-error';
import { useAuth } from '../../../../app/providers/auth-provider';
import type { LoginCredentials, LoginResult, LoginState } from '../domain/login.types';
import { executeLogin } from './login-api';

/** Safely retrieves useAuth context without throwing if unmounted */
function useOptionalAuth() {
  try {
    return useAuth();
  } catch {
    return null;
  }
}

/** Safely extracts search params without throwing if outside Router context */
function useOptionalSearchParams(): URLSearchParams | null {
  try {
    const [searchParams] = useSearchParams();
    return searchParams;
  } catch {
    try {
      const location = useLocation();
      return new URLSearchParams(location.search);
    } catch {
      if (typeof window !== 'undefined' && window.location) {
        return new URLSearchParams(window.location.search);
      }
      return null;
    }
  }
}

import { sanitizeRedirectPath } from '../../../../shared/auth/redirect-utils';
export { sanitizeRedirectPath };

export interface UseLoginMutationReturn {
  readonly mutateAsync: (credentials: LoginCredentials) => Promise<LoginResult>;
  readonly mutate: (credentials: LoginCredentials) => void;
  readonly isPending: boolean;
  readonly isLoading: boolean;
  readonly isSuccess: boolean;
  readonly isError: boolean;
  readonly loginState: LoginState;
  readonly error: ApiError | null;
  readonly result: LoginResult | null;
  readonly resetState: () => void;
}

/**
 * Login Mutation Hook
 *
 * Primary use-case integration hook for authenticating users:
 * 1. Invokes low-level `executeLogin(credentials)` network call.
 * 2. Registers access token in memory (`authTokenStore`).
 * 3. Triggers `auth.login()` to transition `AuthProvider` state to `AUTHENTICATED`.
 * 4. Resolves post-login target path (`redirect` query param or fallback `/dashboard`).
 * 5. Normalizes errors and maintains explicit `LoginState` UI presentation model.
 */
export function useLoginMutation(): UseLoginMutationReturn {
  const auth = useOptionalAuth();
  const searchParams = useOptionalSearchParams();

  const redirectPath = useMemo(() => {
    const rawRedirect = searchParams?.get('redirect');
    return sanitizeRedirectPath(rawRedirect);
  }, [searchParams]);

  const [loginState, setLoginState] = useState<LoginState>('INITIAL');
  const [normalizedError, setNormalizedError] = useState<ApiError | null>(null);
  const [loginResult, setLoginResult] = useState<LoginResult | null>(null);

  const mutation = useMutation<LoginResult, ApiError, LoginCredentials>({
    mutationFn: async (credentials: LoginCredentials): Promise<LoginResult> => {
      setLoginState('SUBMITTING');
      setNormalizedError(null);

      try {
        await executeLogin(credentials);

        // Update global AuthProvider session context if available
        if (auth?.login) {
          await auth.login();
        }

        const result: LoginResult = {
          success: true,
          user: auth?.currentUser ?? null,
          redirectPath,
          error: null,
        };

        setLoginResult(result);
        setLoginState('SUCCESS');
        return result;
      } catch (rawErr) {
        const apiErr = rawErr instanceof ApiError ? rawErr : normalizeApiError(rawErr);
        setNormalizedError(apiErr);

        if (apiErr instanceof ValidationError || apiErr.statusCode === 400) {
          setLoginState('VALIDATION_ERROR');
        } else if (apiErr instanceof AuthenticationError || apiErr.statusCode === 401) {
          setLoginState('AUTHENTICATION_ERROR');
        } else {
          setLoginState('NETWORK_ERROR');
        }

        const failureResult: LoginResult = {
          success: false,
          user: null,
          redirectPath: '/auth/login',
          error: apiErr,
        };

        setLoginResult(failureResult);
        throw apiErr;
      }
    },
  });

  const resetState = useCallback(() => {
    mutation.reset();
    setLoginState('INITIAL');
    setNormalizedError(null);
    setLoginResult(null);
  }, [mutation]);

  return {
    mutateAsync: mutation.mutateAsync,
    mutate: mutation.mutate,
    isPending: mutation.isPending,
    isLoading: mutation.isPending,
    isSuccess: mutation.isSuccess,
    isError: mutation.isError,
    loginState,
    error: normalizedError,
    result: loginResult,
    resetState,
  };
}
