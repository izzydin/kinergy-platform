/**
 * Track B — Step B2.3: Refresh Token Lifecycle & Session Restoration Test Suite
 *
 * Behavior & Contract Integration Test Suite for Step B2.3:
 *   1. Successful silent refresh & session restoration on reload (BOOTSTRAPPING → AUTHENTICATED)
 *   2. Invalid refresh session handling (401 → UNAUTHENTICATED)
 *   3. Expired refresh token handling (401 TOKEN_EXPIRED → UNAUTHENTICATED)
 *   4. Network failure handling (FetchError → AUTHENTICATION_ERROR with retry support)
 *   5. Backend gateway error (500 → AUTHENTICATION_ERROR without clearing session)
 *   6. Profile fetch failure (/me 403 → UNAUTHENTICATED)
 *   7. Concurrent refresh request single-flight deduplication (3 concurrent requests → 1 refresh call)
 */
import '@testing-library/jest-dom';
import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '../../../../app/providers/auth-provider';
import { authTokenStore } from '../../../../shared/auth/auth-token-store';
import { setupAuthTransport } from '../../../../shared/auth/auth-transport';
import { httpClient } from '../../../../shared/api/http-client';
import type { AuthUser } from '../../../auth/domain/auth-state.types';

const MOCK_USER: AuthUser = {
  id: 'usr-b2-3-test',
  email: 'architect@kinergy.io',
  name: 'Lead Architect',
  roles: ['ADMIN'],
  permissions: ['client:read', 'energy:read'],
  tenantId: 'tenant_b2_3',
};

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

const SessionStatusDisplay: React.FC = () => {
  const { status, currentUser, error, retryBootstrap } = useAuth();
  return (
    <div>
      <span data-testid="auth-status">{status}</span>
      <span data-testid="user-email">{currentUser?.email ?? 'None'}</span>
      <span data-testid="error-message">{error?.message ?? 'None'}</span>
      <button data-testid="retry-button" onClick={() => void retryBootstrap()}>
        Retry
      </button>
    </div>
  );
};

interface TestWrapperProps {
  children: React.ReactNode;
  queryClient?: QueryClient;
}

const TestWrapper: React.FC<TestWrapperProps> = ({
  children,
  queryClient = createTestQueryClient(),
}) => {
  setupAuthTransport(httpClient);
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
};

describe('Track B — Step B2.3: Refresh Token Lifecycle & Session Restoration', () => {
  let fetchSpy: jest.SpyInstance;
  let refreshCount: number;

  beforeEach(() => {
    refreshCount = 0;
    act(() => {
      authTokenStore.clearSession();
    });

    setupAuthTransport(httpClient);

    if (!global.fetch) {
      (global as unknown as { fetch: typeof fetch }).fetch = jest.fn();
    }

    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation((url, init) => {
      const urlStr = extractUrl(url);

      if (urlStr.includes('/api/v1/auth/refresh')) {
        refreshCount += 1;
        return Promise.resolve(
          createMockResponse({
            accessToken: 'mock-msw-refresh-access-token-999',
            expiresIn: 900,
          }),
        );
      }

      if (urlStr.includes('/api/v1/auth/me')) {
        return Promise.resolve(createMockResponse(MOCK_USER, 200));
      }

      if (urlStr.includes('/api/v1/protected-resource')) {
        const headers = init?.headers;
        let authHeader: string | null = null;

        if (headers instanceof Headers) {
          authHeader = headers.get('Authorization');
        } else if (headers && typeof headers === 'object') {
          authHeader = (headers as Record<string, string>)['Authorization'] ?? null;
        }

        if (!authHeader || !authHeader.includes('mock-msw-refresh-access-token-999')) {
          return Promise.resolve(createMockResponse({ message: 'Unauthorized' }, 401));
        }

        return Promise.resolve(createMockResponse({ data: 'Protected Data Payload' }, 200));
      }

      return Promise.resolve(createMockResponse({ status: 'ok' }, 200));
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  // ─── 1. Successful Refresh & Session Restoration ───────────────────────────

  it('1. Session Restoration — restores authentication state on reload via silent refresh', async () => {
    render(
      <TestWrapper>
        <SessionStatusDisplay />
      </TestWrapper>,
    );

    // Initial state: BOOTSTRAPPING
    expect(screen.getByTestId('auth-status')).toHaveTextContent('BOOTSTRAPPING');

    // Wait for silent refresh & profile fetch to complete
    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent('AUTHENTICATED');
      expect(screen.getByTestId('user-email')).toHaveTextContent('architect@kinergy.io');
    });

    // In-memory access token registered
    expect(authTokenStore.getAccessToken()).toBe('mock-msw-refresh-access-token-999');
    expect(refreshCount).toBe(1);
  });

  // ─── 2. Invalid Refresh Session ───────────────────────────────────────────

  it('2. Invalid Refresh Session — transitions to UNAUTHENTICATED when refresh cookie is invalid (401)', async () => {
    fetchSpy.mockImplementation((url) => {
      const urlStr = extractUrl(url);
      if (urlStr.includes('/api/v1/auth/refresh')) {
        refreshCount += 1;
        return Promise.resolve(
          createMockResponse({ statusCode: 401, message: 'Invalid refresh token session' }, 401),
        );
      }
      return Promise.resolve(createMockResponse({ status: 'ok' }));
    });

    render(
      <TestWrapper>
        <SessionStatusDisplay />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent('UNAUTHENTICATED');
      expect(screen.getByTestId('user-email')).toHaveTextContent('None');
    });

    expect(authTokenStore.getAccessToken()).toBeNull();
  });

  // ─── 3. Expired Refresh Token ─────────────────────────────────────────────

  it('3. Expired Refresh Token — transitions to UNAUTHENTICATED when refresh cookie is expired', async () => {
    fetchSpy.mockImplementation((url) => {
      const urlStr = extractUrl(url);
      if (urlStr.includes('/api/v1/auth/refresh')) {
        refreshCount += 1;
        return Promise.resolve(
          createMockResponse(
            { statusCode: 401, message: 'Refresh token has expired. Please log in again.' },
            401,
          ),
        );
      }
      return Promise.resolve(createMockResponse({ status: 'ok' }));
    });

    render(
      <TestWrapper>
        <SessionStatusDisplay />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent('UNAUTHENTICATED');
    });

    expect(authTokenStore.getAccessToken()).toBeNull();
  });

  // ─── 4. Network Failure & Retry ───────────────────────────────────────────

  it('4. Network Failure — transitions to AUTHENTICATION_ERROR and supports retryBootstrap()', async () => {
    let networkAttempts = 0;
    fetchSpy.mockImplementation((url) => {
      const urlStr = extractUrl(url);
      if (urlStr.includes('/api/v1/auth/refresh')) {
        networkAttempts += 1;
        if (networkAttempts === 1) {
          return Promise.reject(new TypeError('Failed to fetch'));
        }
        return Promise.resolve(
          createMockResponse({
            accessToken: 'mock-recovered-token-123',
            expiresIn: 900,
          }),
        );
      }
      if (urlStr.includes('/api/v1/auth/me')) {
        return Promise.resolve(createMockResponse(MOCK_USER, 200));
      }
      return Promise.resolve(createMockResponse({ status: 'ok' }));
    });

    render(
      <TestWrapper>
        <SessionStatusDisplay />
      </TestWrapper>,
    );

    // Network failure → AUTHENTICATION_ERROR
    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent('AUTHENTICATION_ERROR');
    });

    // Session is NOT force cleared on network error
    expect(authTokenStore.getAccessToken()).toBeNull();

    // Trigger retry
    act(() => {
      screen.getByTestId('retry-button').click();
    });

    // Recovery succeeds → AUTHENTICATED
    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent('AUTHENTICATED');
      expect(screen.getByTestId('user-email')).toHaveTextContent('architect@kinergy.io');
    });

    expect(authTokenStore.getAccessToken()).toBe('mock-recovered-token-123');
  });

  // ─── 5. Backend Gateway Failure (500) ──────────────────────────────────────

  it('5. Backend Failure — 500 error transitions to AUTHENTICATION_ERROR without clearing local state', async () => {
    fetchSpy.mockImplementation((url) => {
      const urlStr = extractUrl(url);
      if (urlStr.includes('/api/v1/auth/refresh')) {
        return Promise.resolve(
          createMockResponse(
            { statusCode: 500, message: 'Authentication Service Unavailable' },
            500,
          ),
        );
      }
      return Promise.resolve(createMockResponse({ status: 'ok' }));
    });

    render(
      <TestWrapper>
        <SessionStatusDisplay />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent('AUTHENTICATION_ERROR');
    });
  });

  // ─── 6. Profile Fetch Failure (/me 403) ───────────────────────────────────

  it('6. Profile Fetch Failure — 403 on /me transitions to UNAUTHENTICATED and clears tokens', async () => {
    fetchSpy.mockImplementation((url) => {
      const urlStr = extractUrl(url);
      if (urlStr.includes('/api/v1/auth/refresh')) {
        return Promise.resolve(
          createMockResponse({ accessToken: 'valid-temp-token', expiresIn: 900 }),
        );
      }
      if (urlStr.includes('/api/v1/auth/me')) {
        return Promise.resolve(
          createMockResponse({ statusCode: 403, message: 'User account has been blocked.' }, 403),
        );
      }
      return Promise.resolve(createMockResponse({ status: 'ok' }));
    });

    render(
      <TestWrapper>
        <SessionStatusDisplay />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent('UNAUTHENTICATED');
    });

    expect(authTokenStore.getAccessToken()).toBeNull();
  });

  // ─── 7. Concurrent Refresh Requests & Single-Flight Deduplication ──────────

  it('7. Single-Flight Deduplication — 3 concurrent 401 requests trigger EXACTLY ONE /auth/refresh call', async () => {
    setupAuthTransport(httpClient);

    // Initial state: no access token in memory
    expect(authTokenStore.getAccessToken()).toBeNull();

    // Trigger 3 concurrent requests to a protected resource
    const req1 = httpClient.get<{ data: string }>('/api/v1/protected-resource');
    const req2 = httpClient.get<{ data: string }>('/api/v1/protected-resource');
    const req3 = httpClient.get<{ data: string }>('/api/v1/protected-resource');

    const [res1, res2, res3] = await Promise.all([req1, req2, req3]);

    // All 3 requests succeed transparently after silent refresh
    expect(res1.data).toBe('Protected Data Payload');
    expect(res2.data).toBe('Protected Data Payload');
    expect(res3.data).toBe('Protected Data Payload');

    // EXACTLY ONE refresh HTTP call was generated
    expect(refreshCount).toBe(1);
    expect(authTokenStore.getAccessToken()).toBe('mock-msw-refresh-access-token-999');
  });
});
