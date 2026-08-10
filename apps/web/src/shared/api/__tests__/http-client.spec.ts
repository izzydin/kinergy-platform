import {
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  HttpClient,
  NetworkError,
  NotFoundError,
  RateLimitError,
  RequestCanceledError,
  ServerError,
  ValidationError,
} from '../index';

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

describe('Step A6.2 — Shared HTTP API Client Transport Infrastructure', () => {
  let client: HttpClient;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    client = new HttpClient(() => 'http://localhost:3000/api/v1');
    if (!global.fetch) {
      global.fetch = jest.fn();
    }
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('1. HTTP Method Execution & JSON Serialization', () => {
    it('executes successful GET request and returns typed JSON payload', async () => {
      const mockData = { items: [{ id: '1', title: 'Metric 1' }] };
      fetchSpy.mockResolvedValueOnce(createMockResponse(mockData, 200));

      const response = await client.get<{ items: Array<{ id: string; title: string }> }>(
        '/dashboard/metrics',
      );

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/dashboard/metrics',
        expect.objectContaining({
          method: 'GET',
          headers: expect.any(Headers),
        }),
      );
      expect(response).toEqual(mockData);
    });

    it('executes successful POST request with serialized body', async () => {
      const payload = { displayName: 'Updated Name', email: 'user@kinergy.io' };
      const responseData = { success: true };

      fetchSpy.mockResolvedValueOnce(createMockResponse(responseData, 200));

      const result = await client.post<{ success: boolean }>('/settings/profile', payload);

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/settings/profile',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(payload),
          headers: expect.any(Headers),
        }),
      );
      expect(result).toEqual(responseData);
    });

    it('executes PUT, PATCH, and DELETE requests', async () => {
      fetchSpy.mockResolvedValue(createMockResponse({ ok: true }, 200));

      await client.put('/items/1', { name: 'Put' });
      await client.patch('/items/1', { name: 'Patch' });
      await client.delete('/items/1');

      expect(fetchSpy).toHaveBeenCalledTimes(3);
    });

    it('appends options.params query parameters onto the URL', async () => {
      fetchSpy.mockResolvedValueOnce(createMockResponse([], 200));

      await client.get('/clients', {
        params: { page: 1, limit: 20, active: true, search: 'test query' },
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/clients?page=1&limit=20&active=true&search=test+query',
        expect.anything(),
      );
    });

    it('handles HTTP 204 No Content response gracefully', async () => {
      fetchSpy.mockResolvedValueOnce(createMockResponse(null, 204));

      const response = await client.delete<null>('/items/1');
      expect(response).toBeNull();
    });

    it('handles empty string body response as null', async () => {
      fetchSpy.mockResolvedValueOnce(createMockResponse('', 200));

      const response = await client.get<null>('/ping');
      expect(response).toBeNull();
    });
  });

  describe('2. Header Management & Auth/Tenant Interceptors', () => {
    it('injects Authorization Bearer header when authTokenGetter is set', async () => {
      client.setAuthTokenGetter(() => 'mock-jwt-access-token');
      fetchSpy.mockResolvedValueOnce(createMockResponse({}, 200));

      await client.get('/protected-route');

      const calledHeaders = fetchSpy.mock.calls[0]?.[1]?.headers as Headers;
      expect(calledHeaders.get('Authorization')).toBe('Bearer mock-jwt-access-token');
    });

    it('bypasses Authorization header injection when skipAuth is true', async () => {
      client.setAuthTokenGetter(() => 'mock-jwt-access-token');
      fetchSpy.mockResolvedValueOnce(createMockResponse({}, 200));

      await client.get('/public-route', { skipAuth: true });

      const calledHeaders = fetchSpy.mock.calls[0]?.[1]?.headers as Headers;
      expect(calledHeaders.get('Authorization')).toBeNull();
    });

    it('injects X-Tenant-ID header when tenantIdGetter is set', async () => {
      client.setTenantIdGetter(() => 'tenant-42');
      fetchSpy.mockResolvedValueOnce(createMockResponse({}, 200));

      await client.get('/tenant-route');

      const calledHeaders = fetchSpy.mock.calls[0]?.[1]?.headers as Headers;
      expect(calledHeaders.get('X-Tenant-ID')).toBe('tenant-42');
    });

    it('executes custom request and response interceptor functions', async () => {
      const requestInterceptor = jest.fn((config) => {
        (config.init.headers as Headers).set('X-Custom-Header', 'custom-value');
        return config;
      });

      const responseInterceptor = jest.fn((response) => response);

      client.addRequestInterceptor(requestInterceptor);
      client.addResponseInterceptor(responseInterceptor);

      fetchSpy.mockResolvedValueOnce(createMockResponse({ ok: true }, 200));

      await client.get('/intercepted');

      expect(requestInterceptor).toHaveBeenCalled();
      expect(responseInterceptor).toHaveBeenCalled();
      const calledHeaders = fetchSpy.mock.calls[0]?.[1]?.headers as Headers;
      expect(calledHeaders.get('X-Custom-Header')).toBe('custom-value');
    });
  });

  describe('3. Error Normalization & Status Code Hierarchy', () => {
    it('normalizes HTTP 400 Bad Request into ValidationError with field details', async () => {
      const errorBody = {
        statusCode: 400,
        error: 'Bad Request',
        message: 'Validation failed for request payload.',
        details: { email: ['Must be a valid email address'] },
      };

      fetchSpy.mockResolvedValueOnce(createMockResponse(errorBody, 400));

      await expect(client.post('/settings/profile', {})).rejects.toThrow(ValidationError);

      try {
        await client.post('/settings/profile', {});
      } catch (err) {
        expect(err).toBeInstanceOf(ValidationError);
        const valErr = err as ValidationError;
        expect(valErr.statusCode).toBe(400);
        expect(valErr.code).toBe('VALIDATION_ERROR');
        expect(valErr.details).toEqual({ email: ['Must be a valid email address'] });
        expect(valErr.isRecoverable).toBe(true);
      }
    });

    it('normalizes HTTP 401 Unauthorized into AuthenticationError', async () => {
      fetchSpy.mockResolvedValueOnce(
        createMockResponse({ statusCode: 401, message: 'Invalid token' }, 401),
      );

      await expect(client.get('/me')).rejects.toThrow(AuthenticationError);
    });

    it('normalizes HTTP 403 Forbidden into AuthorizationError', async () => {
      fetchSpy.mockResolvedValueOnce(
        createMockResponse({ statusCode: 403, message: 'Admin permissions required' }, 403),
      );

      await expect(client.get('/admin')).rejects.toThrow(AuthorizationError);
    });

    it('normalizes HTTP 404 Not Found into NotFoundError', async () => {
      fetchSpy.mockResolvedValueOnce(
        createMockResponse({ statusCode: 404, message: 'Asset not found' }, 404),
      );

      await expect(client.get('/items/999')).rejects.toThrow(NotFoundError);
    });

    it('normalizes HTTP 409 Conflict into ConflictError', async () => {
      fetchSpy.mockResolvedValueOnce(
        createMockResponse({ statusCode: 409, message: 'Resource exists' }, 409),
      );

      await expect(client.post('/users', {})).rejects.toThrow(ConflictError);
    });

    it('normalizes HTTP 429 Too Many Requests into RateLimitError', async () => {
      fetchSpy.mockResolvedValueOnce(
        createMockResponse(
          {
            statusCode: 429,
            message: 'Too many requests',
            retryAfterSeconds: 60,
          },
          429,
        ),
      );

      try {
        await client.get('/rate-limited');
      } catch (err) {
        expect(err).toBeInstanceOf(RateLimitError);
        expect((err as RateLimitError).retryAfterSeconds).toBe(60);
      }
    });

    it('normalizes HTTP 500 Internal Server Error into ServerError', async () => {
      fetchSpy.mockResolvedValueOnce(
        createMockResponse({ statusCode: 500, message: 'Database failure' }, 500),
      );

      await expect(client.get('/broken')).rejects.toThrow(ServerError);
    });

    it('normalizes TypeError fetch failures into NetworkError', async () => {
      fetchSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      await expect(client.get('/offline')).rejects.toThrow(NetworkError);
    });

    it('normalizes AbortController signal cancellations into RequestCanceledError', async () => {
      const abortError = new DOMException('The operation was aborted.', 'AbortError');
      fetchSpy.mockRejectedValueOnce(abortError);

      const controller = new AbortController();

      await expect(client.get('/long-running', { signal: controller.signal })).rejects.toThrow(
        RequestCanceledError,
      );
    });

    it('throws ServerError when non-204 response body returns malformed non-JSON HTML', async () => {
      fetchSpy.mockResolvedValueOnce(
        createMockResponse('<html><body>502 Bad Gateway</body></html>', 200),
      );

      await expect(client.get('/html-response')).rejects.toThrow(ServerError);
    });
  });
});
