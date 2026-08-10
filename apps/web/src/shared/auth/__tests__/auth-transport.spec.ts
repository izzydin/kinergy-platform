import { AuthenticationError, HttpClient } from '../../api';
import { AuthTokenStore, setupAuthTransport } from '../index';

function createMockResponse(body: unknown, status = 200): Response {
  const isString = typeof body === 'string';
  const textContent = isString
    ? (body as string)
    : body !== null && body !== undefined
      ? JSON.stringify(body)
      : '';

  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(textContent),
    json: () => {
      if (!textContent) return Promise.resolve({});
      try {
        return Promise.resolve(isString ? JSON.parse(textContent) : body);
      } catch (err) {
        return Promise.reject(err);
      }
    },
  } as Response;
}

describe('Step A6.3 — Authentication Transport Infrastructure', () => {
  let tokenStore: AuthTokenStore;
  let client: HttpClient;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    tokenStore = new AuthTokenStore();
    client = new HttpClient(() => 'http://localhost:3000/api/v1');
    setupAuthTransport(client, {
      refreshEndpoint: 'http://localhost:3000/api/v1/auth/refresh',
      tokenStore,
    });

    if (!global.fetch) {
      global.fetch = jest.fn();
    }
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('1. Access Token Storage & Event Lifecycle', () => {
    it('stores access token in memory and reports authentication status', () => {
      expect(tokenStore.getAccessToken()).toBeNull();
      expect(tokenStore.isAuthenticated()).toBe(false);

      tokenStore.setAccessToken('mock-jwt-token');

      expect(tokenStore.getAccessToken()).toBe('mock-jwt-token');
      expect(tokenStore.isAuthenticated()).toBe(true);
    });

    it('emits login and logout events when access token transitions', () => {
      const listener = jest.fn();
      tokenStore.subscribe(listener);

      tokenStore.setAccessToken('token-1');
      expect(listener).toHaveBeenCalledWith('login');

      tokenStore.clearSession();
      expect(listener).toHaveBeenCalledWith('logout');
      expect(tokenStore.getAccessToken()).toBeNull();
    });

    it('emits unauthorized event on explicit notifyUnauthorized call', () => {
      const listener = jest.fn();
      tokenStore.subscribe(listener);
      tokenStore.setAccessToken('token-1');

      tokenStore.notifyUnauthorized();

      expect(listener).toHaveBeenCalledWith('unauthorized');
      expect(tokenStore.getAccessToken()).toBeNull();
    });
  });

  describe('2. Authenticated Requests & Authorization Headers', () => {
    it('automatically attaches Authorization Bearer header when token is present', async () => {
      tokenStore.setAccessToken('active-access-token');
      fetchSpy.mockResolvedValueOnce(createMockResponse({ id: 'user_1' }, 200));

      await client.get('/me');

      const calledHeaders = fetchSpy.mock.calls[0]?.[1]?.headers as Headers;
      expect(calledHeaders.get('Authorization')).toBe('Bearer active-access-token');
    });

    it('omits Authorization header when token store is empty', async () => {
      fetchSpy.mockResolvedValueOnce(createMockResponse({ public: true }, 200));

      await client.get('/public');

      const calledHeaders = fetchSpy.mock.calls[0]?.[1]?.headers as Headers;
      expect(calledHeaders.get('Authorization')).toBeNull();
    });
  });

  describe('3. Silent Token Refresh (RTR) & Transparent Request Retry', () => {
    it('intercepts 401 response, executes silent refresh, and retries original request transparently', async () => {
      tokenStore.setAccessToken('expired-old-token');

      // Call 1: Original request returns 401 Unauthorized
      fetchSpy.mockResolvedValueOnce(
        createMockResponse({ statusCode: 401, message: 'Token expired' }, 401),
      );

      // Call 2: Refresh token request returns new access token
      fetchSpy.mockResolvedValueOnce(
        createMockResponse({ accessToken: 'refreshed-new-token' }, 200),
      );

      // Call 3: Retried original request succeeds with new token
      fetchSpy.mockResolvedValueOnce(
        createMockResponse({ success: true, data: 'Protected Data' }, 200),
      );

      const response = await client.get<{ success: boolean; data: string }>('/protected/resource');

      expect(fetchSpy).toHaveBeenCalledTimes(3);

      // Verify refresh call payload
      const refreshCall = fetchSpy.mock.calls[1];
      expect(refreshCall?.[0]).toBe('http://localhost:3000/api/v1/auth/refresh');
      expect(refreshCall?.[1]?.method).toBe('POST');

      // Verify retried request headers
      const retryCallHeaders = fetchSpy.mock.calls[2]?.[1]?.headers as Headers;
      expect(retryCallHeaders.get('Authorization')).toBe('Bearer refreshed-new-token');
      expect(retryCallHeaders.get('X-Retry-Attempt')).toBe('1');

      // Verify end result
      expect(response).toEqual({ success: true, data: 'Protected Data' });
      expect(tokenStore.getAccessToken()).toBe('refreshed-new-token');
    });

    it('clears session and emits unauthorized when silent refresh fails with 401', async () => {
      tokenStore.setAccessToken('expired-token');
      const listener = jest.fn();
      tokenStore.subscribe(listener);

      // Call 1: Initial request returns 401
      fetchSpy.mockResolvedValueOnce(
        createMockResponse({ statusCode: 401, message: 'Token expired' }, 401),
      );

      // Call 2: Refresh request fails with 401
      fetchSpy.mockResolvedValueOnce(
        createMockResponse({ statusCode: 401, message: 'Refresh token revoked' }, 401),
      );

      await expect(client.get('/protected')).rejects.toThrow(AuthenticationError);

      expect(tokenStore.getAccessToken()).toBeNull();
      expect(listener).toHaveBeenCalledWith('unauthorized');
    });
  });

  describe('4. Concurrency & Refresh Storm Prevention', () => {
    it('queues concurrent simultaneous 401 requests onto a SINGLE refresh token execution', async () => {
      tokenStore.setAccessToken('stale-token');

      // Mock sequence:
      // Call 1: Request A initial 401
      // Call 2: Request B initial 401
      // Call 3: Request C initial 401
      // Call 4: Single POST /auth/refresh execution returns new token
      // Call 5: Retried Request A succeeds
      // Call 6: Retried Request B succeeds
      // Call 7: Retried Request C succeeds
      fetchSpy
        .mockResolvedValueOnce(createMockResponse({}, 401)) // Request A initial
        .mockResolvedValueOnce(createMockResponse({}, 401)) // Request B initial
        .mockResolvedValueOnce(createMockResponse({}, 401)) // Request C initial
        .mockResolvedValueOnce(createMockResponse({ accessToken: 'shared-new-token' }, 200)) // SINGLE Refresh
        .mockResolvedValueOnce(createMockResponse({ id: 'A' }, 200)) // Retry A
        .mockResolvedValueOnce(createMockResponse({ id: 'B' }, 200)) // Retry B
        .mockResolvedValueOnce(createMockResponse({ id: 'C' }, 200)); // Retry C

      // Trigger 3 concurrent requests simultaneously
      const [resA, resB, resC] = await Promise.all([
        client.get<{ id: string }>('/resource-a'),
        client.get<{ id: string }>('/resource-b'),
        client.get<{ id: string }>('/resource-c'),
      ]);

      expect(resA).toEqual({ id: 'A' });
      expect(resB).toEqual({ id: 'B' });
      expect(resC).toEqual({ id: 'C' });

      // Verify that exactly ONE POST /auth/refresh request was executed!
      const refreshCalls = fetchSpy.mock.calls.filter(
        (call) => call[0] === 'http://localhost:3000/api/v1/auth/refresh',
      );
      expect(refreshCalls.length).toBe(1);
    });
  });

  describe('5. Infinite Retry Loop Protection', () => {
    it('prevents infinite retry loops when a retried request still returns 401', async () => {
      tokenStore.setAccessToken('token-v1');

      // Call 1: Initial request returns 401
      fetchSpy.mockResolvedValueOnce(createMockResponse({}, 401));
      // Call 2: Refresh succeeds
      fetchSpy.mockResolvedValueOnce(createMockResponse({ accessToken: 'token-v2' }, 200));
      // Call 3: Retried request with token-v2 STILL returns 401 (e.g. revoked role)
      fetchSpy.mockResolvedValueOnce(createMockResponse({ message: 'Forbidden' }, 401));

      await expect(client.get('/strict-resource')).rejects.toThrow(AuthenticationError);

      // Verify that no second refresh call was made
      const refreshCalls = fetchSpy.mock.calls.filter(
        (call) => call[0] === 'http://localhost:3000/api/v1/auth/refresh',
      );
      expect(refreshCalls.length).toBe(1);
      expect(tokenStore.getAccessToken()).toBeNull();
    });
  });
});
