import { getAppConfig } from '../../app/config/app-config';
import { normalizeApiError, RequestCanceledError, ServerError } from './api-error';

export type AuthTokenGetter = () => string | null | Promise<string | null>;
export type TenantIdGetter = () => string | null | Promise<string | null>;

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  /** Optional query/search parameters appended to the URL */
  params?: Record<string, string | number | boolean | null | undefined>;
  /** Optional custom headers overriding default transport headers */
  headers?: Record<string, string>;
  /** Optional AbortSignal for request cancellation */
  signal?: AbortSignal;
  /** Optional flag to bypass default Authorization token injection */
  skipAuth?: boolean;
}

export type RequestInterceptor = (config: {
  url: string;
  init: RequestInit;
}) => Promise<{ url: string; init: RequestInit }> | { url: string; init: RequestInit };

export type ResponseInterceptor = (
  response: Response,
  request: { url: string; init: RequestInit },
) => Promise<Response> | Response;

/**
 * Standardized HTTP API Client Transport Adapter (`shared/api/http-client.ts`)
 *
 * Core transport infrastructure for all frontend network interactions.
 * Features:
 * - Base URL resolution from getAppConfig().apiBaseUrl
 * - Typed HTTP methods (get, post, put, patch, delete)
 * - JSON serialization & deserialization
 * - Pluggable Bearer token injection (setAuthTokenGetter)
 * - Pluggable Tenant ID header injection (setTenantIdGetter)
 * - Request/Response interceptor pipeline
 * - AbortSignal cancellation support
 * - Automatic HTTP 4xx/5xx error normalization via normalizeApiError
 *
 * Architecture Rules:
 * - NOT coupled to React hooks or React component lifecycles.
 * - NOT coupled to TanStack Query.
 * - Contains ZERO domain business logic.
 */
export class HttpClient {
  private authTokenGetter: AuthTokenGetter | null = null;
  private tenantIdGetter: TenantIdGetter | null = null;
  private readonly requestInterceptors: RequestInterceptor[] = [];
  private readonly responseInterceptors: ResponseInterceptor[] = [];

  constructor(private readonly baseUrlResolver: () => string = () => getAppConfig().apiBaseUrl) {}

  /** Sets the pluggable auth token getter (invoked before requests to attach Bearer token) */
  setAuthTokenGetter(getter: AuthTokenGetter | null): void {
    this.authTokenGetter = getter;
  }

  /** Sets the tenant ID getter (invoked before requests to attach X-Tenant-ID header) */
  setTenantIdGetter(getter: TenantIdGetter | null): void {
    this.tenantIdGetter = getter;
  }

  /** Registers a request interceptor */
  addRequestInterceptor(interceptor: RequestInterceptor): void {
    this.requestInterceptors.push(interceptor);
  }

  /** Registers a response interceptor */
  addResponseInterceptor(interceptor: ResponseInterceptor): void {
    this.responseInterceptors.push(interceptor);
  }

  async get<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  async post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, {
      ...options,
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  async put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, {
      ...options,
      method: 'PUT',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  async patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, {
      ...options,
      method: 'PATCH',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  async delete<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }

  private async request<T>(
    path: string,
    options: RequestOptions & { body?: BodyInit },
  ): Promise<T> {
    const { params, headers: customHeaders, skipAuth, signal, ...restInit } = options;

    // 1. Build target URL
    const url = this.buildUrl(path, params);

    // 2. Build default transport headers
    const headers = new Headers(customHeaders || {});
    if (options.body && typeof options.body === 'string' && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    if (!headers.has('Accept')) {
      headers.set('Accept', 'application/json');
    }

    // 3. Attach Tenant ID if available
    if (this.tenantIdGetter && !headers.has('X-Tenant-ID')) {
      const tenantId = await this.tenantIdGetter();
      if (tenantId) {
        headers.set('X-Tenant-ID', tenantId);
      }
    }

    // 4. Attach Bearer Authorization token if available and not skipped
    if (!skipAuth && this.authTokenGetter && !headers.has('Authorization')) {
      const token = await this.authTokenGetter();
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
    }

    let requestConfig: { url: string; init: RequestInit } = {
      url,
      init: {
        ...restInit,
        headers,
        signal,
      },
    };

    // 5. Execute Request Interceptors
    for (const interceptor of this.requestInterceptors) {
      requestConfig = await interceptor(requestConfig);
    }

    // 6. Execute Native Fetch
    let response: Response;
    try {
      response = await fetch(requestConfig.url, requestConfig.init);
    } catch (error) {
      if (
        (error instanceof DOMException && error.name === 'AbortError') ||
        (error &&
          typeof error === 'object' &&
          'name' in error &&
          (error as { name?: string }).name === 'AbortError')
      ) {
        throw new RequestCanceledError();
      }
      throw normalizeApiError(error);
    }

    // 7. Execute Response Interceptors
    for (const interceptor of this.responseInterceptors) {
      response = await interceptor(response, requestConfig);
    }

    // 8. Handle HTTP Non-OK Responses (4xx/5xx)
    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}));
      const statusCode = response.status;
      const normalizedPayload =
        typeof errorPayload === 'object' && errorPayload !== null
          ? { statusCode, ...errorPayload }
          : { statusCode, message: `HTTP ${statusCode} — ${path}` };

      throw normalizeApiError(normalizedPayload);
    }

    // 9. Handle 204 No Content
    if (response.status === 204) {
      return null as T;
    }

    // 10. Parse JSON Response
    try {
      const text = await response.text();
      if (!text || text.trim().length === 0) {
        return null as T;
      }
      return JSON.parse(text) as T;
    } catch {
      throw new ServerError('Invalid JSON response payload returned from server.', response.status);
    }
  }

  private buildUrl(
    path: string,
    params?: Record<string, string | number | boolean | null | undefined>,
  ): string {
    let fullUrl: string;

    if (path.startsWith('http://') || path.startsWith('https://')) {
      fullUrl = path;
    } else {
      const baseUrl = this.baseUrlResolver().replace(/\/+$/, '');
      const cleanPath = path.startsWith('/') ? path : `/${path}`;
      fullUrl = `${baseUrl}${cleanPath}`;
    }

    if (!params || Object.keys(params).length === 0) {
      return fullUrl;
    }

    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value));
      }
    }

    const queryString = searchParams.toString();
    if (!queryString) return fullUrl;

    const separator = fullUrl.includes('?') ? '&' : '?';
    return `${fullUrl}${separator}${queryString}`;
  }
}

/** Shared singleton instance of HttpClient */
export const httpClient = new HttpClient();
