import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../../../../app/providers/auth-provider';
import { authTokenStore } from '../../../../shared/auth/auth-token-store';
import { mapAuthErrorMessage, useLoginForm } from '../index';

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

const MOCK_USER_PROFILE = {
  id: 'usr-dev-123',
  email: 'operator@kinergy.io',
  name: 'Enterprise Operator',
  roles: ['OPERATOR'],
  permissions: ['client:read', 'energy:read'],
  tenantId: 'tenant_default',
};

describe('Identity Authentication — Login Validation & Mutation Suite (Step B1.2)', () => {
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
          accessToken: 'mock-jwt-token-b1.2',
          tokenType: 'Bearer',
          expiresIn: 900,
          user: MOCK_USER_PROFILE,
        });
      }
      if (url.includes('/api/v1/auth/me')) {
        return createMockResponse(MOCK_USER_PROFILE);
      }
      return createMockResponse({ message: 'Not found' }, 404);
    });
  });

  afterEach(() => {
    if (fetchSpy) {
      fetchSpy.mockRestore();
    }
    queryClient.clear();
    authTokenStore.clearSession();
  });

  const createWrapper =
    (initialUrl = '/auth/login') =>
    ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialUrl]}>
          <AuthProvider skipBootstrap>{children}</AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Error Mapping & Security Policy Tests
  // ───────────────────────────────────────────────────────────────────────────

  describe('mapAuthErrorMessage Security Mapping', () => {
    it('returns generic invalid credentials message for 401 Unauthorized', () => {
      const error = mapAuthErrorMessage({ statusCode: 401 });
      expect(error).toBe('Invalid email or password.');
    });

    it('returns throttling message for 429 Rate Limit', () => {
      const error = mapAuthErrorMessage({ statusCode: 429 });
      expect(error).toBe('Too many login attempts. Please wait a moment before trying again.');
    });

    it('returns offline message for NetworkError / statusCode 0', () => {
      const error = mapAuthErrorMessage({ statusCode: 0 });
      expect(error).toBe(
        'Network connection lost. Please check your internet connection and try again.',
      );
    });

    it('returns server error message for 500 ServerError', () => {
      const error = mapAuthErrorMessage({ statusCode: 500 });
      expect(error).toBe('An unexpected server error occurred. Please try again later.');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. React Hook Form & Validation Tests (useLoginForm)
  // ───────────────────────────────────────────────────────────────────────────

  describe('Form Validation & State (useLoginForm)', () => {
    it('initializes form with empty values and pristine state', () => {
      const { result } = renderHook(() => useLoginForm(), {
        wrapper: createWrapper(),
      });

      expect(result.current.form.getValues()).toEqual({
        email: '',
        password: '',
      });
      expect(result.current.isSubmitting).toBe(false);
      expect(result.current.isPending).toBe(false);
      expect(result.current.authError).toBeNull();
      expect(result.current.loginState).toBe('INITIAL');
    });

    it('validates invalid email syntax', async () => {
      const { result } = renderHook(() => useLoginForm(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.form.setValue('email', 'not-an-email', { shouldValidate: true });
        result.current.form.setValue('password', 'Password123!', { shouldValidate: true });
      });

      expect(result.current.form.formState.errors.email?.message).toBe(
        'Please enter a valid email address.',
      );
      expect(result.current.isValid).toBe(false);
    });

    it('validates missing or short password', async () => {
      const { result } = renderHook(() => useLoginForm(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.form.setValue('email', 'operator@kinergy.io', { shouldValidate: true });
        result.current.form.setValue('password', 'short', { shouldValidate: true });
      });

      expect(result.current.form.formState.errors.password?.message).toBe(
        'Password must be at least 8 characters long.',
      );
      expect(result.current.isValid).toBe(false);
    });

    it('submits valid credentials and transitions to SUCCESS state', async () => {
      const { result } = renderHook(() => useLoginForm(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.form.setValue('email', 'operator@kinergy.io', { shouldValidate: true });
        result.current.form.setValue('password', 'Password123!', { shouldValidate: true });
      });

      await act(async () => {
        await result.current.handleSubmit();
      });

      expect(result.current.loginState).toBe('SUCCESS');
      expect(authTokenStore.getAccessToken()).toBe('mock-jwt-token-b1.2');
    });

    it('handles 401 invalid credentials and sets form-level authError', async () => {
      fetchSpy.mockImplementation(async (input) => {
        const url = extractUrl(input);
        if (url.includes('/api/v1/auth/login')) {
          return createMockResponse({ message: 'Invalid email or password.' }, 401);
        }
        return createMockResponse({ message: 'Not found' }, 404);
      });

      const { result } = renderHook(() => useLoginForm(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.form.setValue('email', 'invalid@kinergy.io', { shouldValidate: true });
        result.current.form.setValue('password', 'wrong-password', { shouldValidate: true });
      });

      await act(async () => {
        await result.current.handleSubmit();
      });

      expect(result.current.loginState).toBe('AUTHENTICATION_ERROR');
      expect(result.current.authError).toBe('Invalid email or password.');
      expect(authTokenStore.getAccessToken()).toBeNull();
    });

    it('handles blocked/inactive account failure cleanly', async () => {
      fetchSpy.mockImplementation(async (input) => {
        const url = extractUrl(input);
        if (url.includes('/api/v1/auth/login')) {
          return createMockResponse({ message: 'User account is inactive or blocked.' }, 401);
        }
        return createMockResponse({ message: 'Not found' }, 404);
      });

      const { result } = renderHook(() => useLoginForm(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.form.setValue('email', 'blocked@kinergy.io', { shouldValidate: true });
        result.current.form.setValue('password', 'Password123!', { shouldValidate: true });
      });

      await act(async () => {
        await result.current.handleSubmit();
      });

      expect(result.current.loginState).toBe('AUTHENTICATION_ERROR');
      expect(result.current.authError).toBe('Invalid email or password.');
    });

    it('handles network failure drop cleanly', async () => {
      fetchSpy.mockImplementation(async () => {
        throw new TypeError('Failed to fetch');
      });

      const { result } = renderHook(() => useLoginForm(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.form.setValue('email', 'operator@kinergy.io', { shouldValidate: true });
        result.current.form.setValue('password', 'Password123!', { shouldValidate: true });
      });

      await act(async () => {
        await result.current.handleSubmit();
      });

      expect(result.current.loginState).toBe('NETWORK_ERROR');
      expect(result.current.authError).toBe(
        'Network connection lost. Please check your internet connection and try again.',
      );
    });

    it('handles unexpected server error (500) cleanly', async () => {
      fetchSpy.mockImplementation(async () => {
        return createMockResponse({ message: 'Internal server error' }, 500);
      });

      const { result } = renderHook(() => useLoginForm(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.form.setValue('email', 'operator@kinergy.io', { shouldValidate: true });
        result.current.form.setValue('password', 'Password123!', { shouldValidate: true });
      });

      await act(async () => {
        await result.current.handleSubmit();
      });

      expect(result.current.loginState).toBe('NETWORK_ERROR');
      expect(result.current.authError).toBe(
        'An unexpected server error occurred. Please try again later.',
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Duplicate Submission Prevention Tests
  // ───────────────────────────────────────────────────────────────────────────

  describe('Duplicate Submission Prevention', () => {
    it('prevents secondary submission triggers while mutation is pending', async () => {
      const { result } = renderHook(() => useLoginForm(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.form.setValue('email', 'operator@kinergy.io', { shouldValidate: true });
        result.current.form.setValue('password', 'Password123!', { shouldValidate: true });
      });

      await act(async () => {
        const submit1 = result.current.handleSubmit();
        const submit2 = result.current.handleSubmit();
        await Promise.all([submit1, submit2]);
      });

      const loginCalls = fetchSpy.mock.calls.filter(([url]) =>
        extractUrl(url).includes('/api/v1/auth/login'),
      );
      expect(loginCalls.length).toBe(1);
    });
  });
});
