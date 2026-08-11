import {
  ApiError,
  AuthenticationError,
  NetworkError,
  ServerError,
  ValidationError,
} from '../../../../shared/api/api-error';
import { authTokenStore } from '../../../../shared/auth/auth-token-store';
import { executeLogin } from '../api/login-api';
import { loginSchema } from '../domain/login.schema';
import type { LoginRequest } from '../domain/login.types';

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

describe('Login API Contract & Error Normalization Layer (Step B1.1)', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    authTokenStore.clearSession();

    if (!global.fetch) {
      (global as unknown as { fetch: typeof fetch }).fetch = jest.fn();
    }
  });

  afterEach(() => {
    if (fetchSpy) {
      fetchSpy.mockRestore();
    }
    authTokenStore.clearSession();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Successful Login Execution & Token Registration
  // ───────────────────────────────────────────────────────────────────────────

  it('successfully executes POST /api/v1/auth/login and stores access token in memory', async () => {
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = extractUrl(input);
      if (url.includes('/api/v1/auth/login')) {
        return createMockResponse({
          accessToken: 'mock-jwt-token-b1.1',
          tokenType: 'Bearer',
          expiresIn: 900,
          user: {
            id: 'usr-123',
            email: 'operator@kinergy.io',
            name: 'Enterprise Operator',
            roles: ['OPERATOR'],
            permissions: ['client:read'],
            tenantId: 'tenant_default',
          },
        });
      }
      return createMockResponse({ message: 'Not found' }, 404);
    });

    const requestPayload: LoginRequest = {
      email: 'operator@kinergy.io',
      password: 'Password123!',
    };

    const response = await executeLogin(requestPayload);

    expect(response).toBeDefined();
    expect(response.accessToken).toBe('mock-jwt-token-b1.1');
    expect(response.tokenType).toBe('Bearer');
    expect(response.user.email).toBe('operator@kinergy.io');
    expect(authTokenStore.getAccessToken()).toBe('mock-jwt-token-b1.1');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Invalid Credentials Handling (401 Unauthorized)
  // ───────────────────────────────────────────────────────────────────────────

  it('normalizes 401 Unauthorized response into typed AuthenticationError for invalid credentials', async () => {
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async () => {
      return createMockResponse(
        {
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Invalid email or password.',
          timestamp: new Date().toISOString(),
          path: '/api/v1/auth/login',
        },
        401,
      );
    });

    const requestPayload: LoginRequest = {
      email: 'invalid@kinergy.io',
      password: 'wrong-password',
    };

    let errorResult: ApiError | null = null;
    try {
      await executeLogin(requestPayload);
    } catch (err) {
      errorResult = err as ApiError;
    }

    expect(errorResult).toBeInstanceOf(AuthenticationError);
    expect(errorResult?.statusCode).toBe(401);
    expect(errorResult?.message).toBe('Invalid email or password.');
    expect(authTokenStore.getAccessToken()).toBeNull();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Blocked / Inactive Account Handling (401 Unauthorized)
  // ───────────────────────────────────────────────────────────────────────────

  it('normalizes 401 Unauthorized response into typed AuthenticationError for blocked/inactive accounts', async () => {
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async () => {
      return createMockResponse(
        {
          statusCode: 401,
          error: 'Unauthorized',
          message: 'User account is inactive or blocked.',
          timestamp: new Date().toISOString(),
          path: '/api/v1/auth/login',
        },
        401,
      );
    });

    const requestPayload: LoginRequest = {
      email: 'blocked@kinergy.io',
      password: 'Password123!',
    };

    let errorResult: ApiError | null = null;
    try {
      await executeLogin(requestPayload);
    } catch (err) {
      errorResult = err as ApiError;
    }

    expect(errorResult).toBeInstanceOf(AuthenticationError);
    expect(errorResult?.statusCode).toBe(401);
    expect(errorResult?.message).toBe('User account is inactive or blocked.');
    expect(authTokenStore.getAccessToken()).toBeNull();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Validation Error Handling (400 Bad Request)
  // ───────────────────────────────────────────────────────────────────────────

  it('normalizes 400 Bad Request response into typed ValidationError', async () => {
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async () => {
      return createMockResponse(
        {
          statusCode: 400,
          error: 'Bad Request',
          message: ['email must be a valid email address'],
          timestamp: new Date().toISOString(),
          path: '/api/v1/auth/login',
        },
        400,
      );
    });

    const requestPayload: LoginRequest = {
      email: 'bad-email',
      password: 'Password123!',
    };

    let errorResult: ApiError | null = null;
    try {
      await executeLogin(requestPayload);
    } catch (err) {
      errorResult = err as ApiError;
    }

    expect(errorResult).toBeInstanceOf(ValidationError);
    expect(errorResult?.statusCode).toBe(400);
    expect(authTokenStore.getAccessToken()).toBeNull();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Server Failure Handling (500 Internal Server Error)
  // ───────────────────────────────────────────────────────────────────────────

  it('normalizes 500 Internal Server Error into typed ServerError', async () => {
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async () => {
      return createMockResponse(
        {
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'Authentication gateway failure',
          timestamp: new Date().toISOString(),
          path: '/api/v1/auth/login',
        },
        500,
      );
    });

    const requestPayload: LoginRequest = {
      email: 'operator@kinergy.io',
      password: 'Password123!',
    };

    let errorResult: ApiError | null = null;
    try {
      await executeLogin(requestPayload);
    } catch (err) {
      errorResult = err as ApiError;
    }

    expect(errorResult).toBeInstanceOf(ServerError);
    expect(errorResult?.statusCode).toBe(500);
    expect(authTokenStore.getAccessToken()).toBeNull();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Network Failure Handling (Network Connection Error)
  // ───────────────────────────────────────────────────────────────────────────

  it('normalizes network connection drops into typed NetworkError', async () => {
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async () => {
      throw new TypeError('Failed to fetch');
    });

    const requestPayload: LoginRequest = {
      email: 'operator@kinergy.io',
      password: 'Password123!',
    };

    let errorResult: ApiError | null = null;
    try {
      await executeLogin(requestPayload);
    } catch (err) {
      errorResult = err as ApiError;
    }

    expect(errorResult).toBeInstanceOf(NetworkError);
    expect(errorResult?.statusCode).toBe(0);
    expect(authTokenStore.getAccessToken()).toBeNull();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 7. Request Payload Validation (loginSchema)
  // ───────────────────────────────────────────────────────────────────────────

  it('validates request credentials prior to API call execution', () => {
    const validResult = loginSchema.safeParse({
      email: 'OPERATOR@KINERGY.IO',
      password: 'Password123!',
    });

    expect(validResult.success).toBe(true);
    if (validResult.success) {
      expect(validResult.data).toEqual({
        email: 'operator@kinergy.io',
        password: 'Password123!',
      });
    }

    const invalidResult = loginSchema.safeParse({
      email: 'not-an-email',
      password: '123',
    });

    expect(invalidResult.success).toBe(false);
  });
});
