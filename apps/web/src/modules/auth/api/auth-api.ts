import { httpClient } from '../../../shared/api/http-client';
import type { UserSession } from '../domain/auth-state.types';

export interface RefreshTokenResponse {
  readonly accessToken: string;
  readonly expiresIn?: number;
}

/**
 * Executes silent refresh via HttpOnly refresh cookie.
 * Skips Authorization header to prevent sending stale tokens.
 */
export async function performSilentRefresh(): Promise<RefreshTokenResponse> {
  return httpClient.post<RefreshTokenResponse>('/api/v1/auth/refresh', undefined, {
    skipAuth: true,
  });
}

/**
 * Fetches current authenticated user profile and permissions.
 */
export async function fetchCurrentUser(): Promise<UserSession> {
  return httpClient.get<UserSession>('/api/v1/auth/me');
}

/**
 * Revokes refresh token session on server.
 */
export async function performLogout(): Promise<{ success: boolean }> {
  return httpClient.post<{ success: boolean }>('/api/v1/auth/logout');
}
