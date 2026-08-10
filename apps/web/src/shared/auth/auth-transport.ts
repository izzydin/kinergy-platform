import { AuthenticationError } from '../api/api-error';
import { HttpClient, ResponseInterceptor } from '../api/http-client';
import { AuthTokenStore, authTokenStore } from './auth-token-store';

export interface AuthTransportConfig {
  /** Target refresh token endpoint URL (defaults to /api/v1/auth/refresh) */
  refreshEndpoint?: string;
  /** In-memory token store instance */
  tokenStore?: AuthTokenStore;
}

/**
 * Authentication Transport & Concurrency Manager (`shared/auth/auth-transport.ts`)
 *
 * Coordinates authentication state, silent Refresh Token Rotation (RTR),
 * 401 response interception, and single-attempt transparent request retries.
 *
 * Security Architecture & Concurrency Rules (ADR 0018 / ADR 0019 / ADR 0029):
 * - Prevents refresh storms: Simultaneous 401 responses queue onto a single shared refresh promise.
 * - Single retry limit: Retried requests are tagged with `X-Retry-Attempt: 1` to prevent infinite retry loops.
 * - Session clearance: If silent refresh fails, in-memory tokens are cleared and `unauthorized` event is emitted.
 * - Framework agnostic: Pure TypeScript transport infrastructure.
 */
export class AuthTransportManager {
  private isRefreshing = false;
  private refreshPromise: Promise<string | null> | null = null;
  private readonly refreshEndpoint: string;
  private readonly tokenStore: AuthTokenStore;

  constructor(config?: AuthTransportConfig) {
    this.refreshEndpoint = config?.refreshEndpoint ?? '/api/v1/auth/refresh';
    this.tokenStore = config?.tokenStore ?? authTokenStore;
  }

  /**
   * Concurrency-safe token refresh execution.
   * Ensures simultaneous 401 responses trigger exactly ONE silent refresh network request.
   */
  async acquireRefreshedToken(): Promise<string | null> {
    if (this.isRefreshing && this.refreshPromise) {
      return this.refreshPromise;
    }

    this.isRefreshing = true;

    this.refreshPromise = (async () => {
      try {
        const response = await fetch(this.refreshEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          credentials: 'same-origin',
        });

        if (!response.ok) {
          throw new AuthenticationError('Session refresh failed.');
        }

        const data = (await response.json().catch(() => ({}))) as { accessToken?: string };
        if (!data.accessToken || typeof data.accessToken !== 'string') {
          throw new AuthenticationError('Invalid refresh token response payload.');
        }

        this.tokenStore.setAccessToken(data.accessToken);
        return data.accessToken;
      } catch (error) {
        this.tokenStore.notifyUnauthorized();
        throw error instanceof AuthenticationError
          ? error
          : new AuthenticationError('Authentication refresh failed.');
      } finally {
        this.isRefreshing = false;
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  /**
   * Creates an HttpClient response interceptor that handles 401 responses,
   * performs silent token refresh, and transparently retries requests.
   */
  createResponseInterceptor(): ResponseInterceptor {
    return async (response, request) => {
      // 1. Only intercept HTTP 401 Unauthorized responses
      if (response.status !== 401) {
        return response;
      }

      // 2. Ignore 401 on /auth/refresh itself or requests already retried
      const isRefreshRequest = request.url.includes(this.refreshEndpoint);
      const isRetryAttempt =
        request.init.headers instanceof Headers
          ? request.init.headers.has('X-Retry-Attempt')
          : Boolean(
              request.init.headers &&
              (request.init.headers as Record<string, string>)['X-Retry-Attempt'],
            );

      if (isRefreshRequest || isRetryAttempt) {
        this.tokenStore.notifyUnauthorized();
        return response;
      }

      // 3. Attempt concurrency-safe silent token refresh
      let newToken: string | null;
      try {
        newToken = await this.acquireRefreshedToken();
      } catch {
        // If refresh fails, return original 401 response (HttpClient normalizes to AuthenticationError)
        return response;
      }

      if (!newToken) {
        return response;
      }

      // 4. Construct retried request with new Bearer token and X-Retry-Attempt flag
      const retryHeaders = new Headers(request.init.headers || {});
      retryHeaders.set('Authorization', `Bearer ${newToken}`);
      retryHeaders.set('X-Retry-Attempt', '1');

      const retriedInit: RequestInit = {
        ...request.init,
        headers: retryHeaders,
      };

      // 5. Execute transparent retry attempt
      const retriedResponse = await fetch(request.url, retriedInit);
      if (retriedResponse.status === 401) {
        this.tokenStore.notifyUnauthorized();
      }
      return retriedResponse;
    };
  }
}

/** Shared singleton instance of AuthTransportManager */
export const authTransport = new AuthTransportManager();

/**
 * Connects AuthTokenStore and AuthTransportManager to an HttpClient instance.
 */
export function setupAuthTransport(
  client: HttpClient,
  config?: AuthTransportConfig,
): AuthTransportManager {
  const manager = new AuthTransportManager(config);
  const store = config?.tokenStore ?? authTokenStore;

  client.setAuthTokenGetter(() => store.getAccessToken());
  client.addResponseInterceptor(manager.createResponseInterceptor());

  return manager;
}
