import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../../../../app/providers/auth-provider';
import { authTokenStore } from '../../../../shared/auth/auth-token-store';
import { executeLogin, loginSchema, sanitizeRedirectPath, useLoginMutation } from '../index';

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

const MOCK_USER_SESSION = {
  id: 'usr-dev-123',
  email: 'operator@kinergy.io',
  name: 'Enterprise Operator',
  roles: ['OPERATOR'],
  permissions: ['client:read', 'energy:read', 'analytics:read'],
  tenantId: 'tenant_default',
};

describe('Identity Authentication Module — Architecture & Contract (Step B1.0)', () => {
  let queryClient: QueryClient;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    authTokenStore.clearSession();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    if (!global.fetch) {
      (global as unknown as { fetch: typeof fetch }).fetch = jest.fn();
    }

    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = extractUrl(input);

      if (url.includes('/api/v1/auth/login')) {
        return createMockResponse({
          accessToken: 'mock-jwt-access-token-login-12345',
          expiresIn: 900,
        });
      }

      if (url.includes('/api/v1/auth/me')) {
        return createMockResponse(MOCK_USER_SESSION);
      }

      return createMockResponse({ message: 'Not found' }, 404);
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    queryClient.clear();
    authTokenStore.clearSession();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Domain Validation Schema Tests (loginSchema)
  // ───────────────────────────────────────────────────────────────────────────

  describe('Credential Validation Schema (loginSchema)', () => {
    it('validates correct email and password credentials', () => {
      const result = loginSchema.safeParse({
        email: 'OPERATOR@KINERGY.IO',
        password: 'Password123!',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe('operator@kinergy.io'); // lowercased & trimmed
        expect(result.data.password).toBe('Password123!');
      }
    });

    it('rejects invalid email formats', () => {
      const result = loginSchema.safeParse({
        email: 'invalid-email-address',
        password: 'Password123!',
      });

      expect(result.success).toBe(false);
      if (!result.success && result.error.issues[0]) {
        expect(result.error.issues[0].message).toBe('Please enter a valid email address.');
      }
    });

    it('rejects empty or missing email', () => {
      const result = loginSchema.safeParse({
        email: '',
        password: 'Password123!',
      });

      expect(result.success).toBe(false);
      if (!result.success && result.error.issues[0]) {
        expect(result.error.issues[0].message).toBe('Email address is required.');
      }
    });

    it('rejects password shorter than 8 characters', () => {
      const result = loginSchema.safeParse({
        email: 'operator@kinergy.io',
        password: 'short',
      });

      expect(result.success).toBe(false);
      if (!result.success && result.error.issues[0]) {
        expect(result.error.issues[0].message).toBe('Password must be at least 8 characters long.');
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Redirect Path Sanitization Tests
  // ───────────────────────────────────────────────────────────────────────────

  describe('Redirect Path Security & Sanitization', () => {
    it('allows valid relative redirect paths starting with /', () => {
      expect(sanitizeRedirectPath('/clients/123')).toBe('/clients/123');
      expect(sanitizeRedirectPath('/energy/meters')).toBe('/energy/meters');
    });

    it('falls back to /dashboard when redirect parameter is null or empty', () => {
      expect(sanitizeRedirectPath(null)).toBe('/dashboard');
      expect(sanitizeRedirectPath(undefined)).toBe('/dashboard');
      expect(sanitizeRedirectPath('')).toBe('/dashboard');
    });

    it('sanitizes open redirect attempts (scheme-relative // or absolute http)', () => {
      expect(sanitizeRedirectPath('//attacker.com/malicious')).toBe('/dashboard');
      expect(sanitizeRedirectPath('https://attacker.com')).toBe('/dashboard');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. API Fetcher & Token Storage Tests (executeLogin)
  // ───────────────────────────────────────────────────────────────────────────

  describe('API Transport & Memory Token Integration (executeLogin)', () => {
    it('executes POST /api/v1/auth/login and sets access token in authTokenStore', async () => {
      expect(authTokenStore.getAccessToken()).toBeNull();

      const response = await executeLogin({
        email: 'operator@kinergy.io',
        password: 'Password123!',
      });

      expect(response.accessToken).toBe('mock-jwt-access-token-login-12345');
      expect(authTokenStore.getAccessToken()).toBe('mock-jwt-access-token-login-12345');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Mutation Pipeline & State Ownership Tests (useLoginMutation)
  // ───────────────────────────────────────────────────────────────────────────

  describe('Use Case Mutation Pipeline (useLoginMutation)', () => {
    const createWrapper =
      (initialUrl = '/auth/login') =>
      ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[initialUrl]}>
            <AuthProvider skipBootstrap>{children}</AuthProvider>
          </MemoryRouter>
        </QueryClientProvider>
      );

    it('initializes in INITIAL loginState', () => {
      const { result } = renderHook(() => useLoginMutation(), {
        wrapper: createWrapper(),
      });

      expect(result.current.loginState).toBe('INITIAL');
      expect(result.current.isPending).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('executes successful login mutation and transitions to SUCCESS state', async () => {
      const { result } = renderHook(() => useLoginMutation(), {
        wrapper: createWrapper('/auth/login?redirect=/clients'),
      });

      let mutationResult;
      await act(async () => {
        mutationResult = await result.current.mutateAsync({
          email: 'operator@kinergy.io',
          password: 'Password123!',
        });
      });

      expect(result.current.loginState).toBe('SUCCESS');
      expect(result.current.isSuccess).toBe(true);
      expect(authTokenStore.getAccessToken()).toBe('mock-jwt-access-token-login-12345');
      expect(mutationResult).toEqual(
        expect.objectContaining({
          success: true,
          redirectPath: '/clients',
        }),
      );
    });

    it('handles 401 Unauthorized credentials error and transitions to AUTHENTICATION_ERROR state', async () => {
      fetchSpy.mockImplementation(async (input) => {
        const url = extractUrl(input);
        if (url.includes('/api/v1/auth/login')) {
          return createMockResponse({ message: 'Invalid email or password.' }, 401);
        }
        return createMockResponse({ message: 'Not found' }, 404);
      });

      const { result } = renderHook(() => useLoginMutation(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        try {
          await result.current.mutateAsync({
            email: 'invalid@kinergy.io',
            password: 'wrong-password',
          });
        } catch {
          // Expected error
        }
      });

      expect(result.current.loginState).toBe('AUTHENTICATION_ERROR');
      expect(result.current.isError).toBe(true);
      expect(result.current.error?.statusCode).toBe(401);
      expect(result.current.error?.message).toBe('Invalid email or password.');
      expect(authTokenStore.getAccessToken()).toBeNull();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Public API Boundary Verification
  // ───────────────────────────────────────────────────────────────────────────

  describe('Controlled Public API Boundary Contract', () => {
    it('exports all expected public contracts', () => {
      expect(loginSchema).toBeDefined();
      expect(executeLogin).toBeDefined();
      expect(useLoginMutation).toBeDefined();
      expect(sanitizeRedirectPath).toBeDefined();
    });
  });
});
