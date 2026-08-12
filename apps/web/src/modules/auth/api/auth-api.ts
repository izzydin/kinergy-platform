import { AuthenticationError } from '../../../shared/api/api-error';
import { httpClient } from '../../../shared/api/http-client';
import { authTransport } from '../../../shared/auth/auth-transport';
import type { UserSession } from '../domain/auth-state.types';

export interface RefreshTokenResponse {
  readonly accessToken: string;
  readonly expiresIn?: number;
}

/**
 * Executes silent refresh via HttpOnly refresh cookie using AuthTransportManager.
 * Shares the single-flight concurrency lock to prevent duplicate refresh requests.
 */
export async function performSilentRefresh(): Promise<RefreshTokenResponse> {
  const token = await authTransport.acquireRefreshedToken();
  if (!token) {
    throw new AuthenticationError('Silent refresh failed.');
  }
  return { accessToken: token };
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
