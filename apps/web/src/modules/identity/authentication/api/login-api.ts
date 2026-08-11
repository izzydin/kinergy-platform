import { httpClient } from '../../../../shared/api/http-client';
import { authTokenStore } from '../../../../shared/auth/auth-token-store';
import type { LoginCredentials, LoginResponse } from '../domain/login.types';

/**
 * Low-Level Authentication API Fetcher
 *
 * Executes HTTP request to `POST /api/v1/auth/login` via `HttpClient`.
 * Skips Authorization header to prevent sending existing stale tokens.
 * Upon successful authentication, registers the received access token in memory (`authTokenStore`).
 */
export async function executeLogin(credentials: LoginCredentials): Promise<LoginResponse> {
  const response = await httpClient.post<LoginResponse>('/api/v1/auth/login', credentials, {
    skipAuth: true,
  });

  if (response?.accessToken) {
    authTokenStore.setAccessToken(response.accessToken);
  }

  return response;
}
