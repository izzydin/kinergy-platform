export interface BuiltHttpRequest {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers: Record<string, string>;
  query: Record<string, string>;
  body: Record<string, unknown> | null;
}

/**
 * Fluent Builder for constructing test HTTP requests across integration suites.
 */
export class HttpRequestBuilder {
  private url = '/';
  private method: BuiltHttpRequest['method'] = 'GET';
  private headers: Record<string, string> = { 'content-type': 'application/json' };
  private query: Record<string, string> = {};
  private body: Record<string, unknown> | null = null;

  public get(url: string): this {
    this.method = 'GET';
    this.url = url;
    return this;
  }

  public post(url: string): this {
    this.method = 'POST';
    this.url = url;
    return this;
  }

  public put(url: string): this {
    this.method = 'PUT';
    this.url = url;
    return this;
  }

  public patch(url: string): this {
    this.method = 'PATCH';
    this.url = url;
    return this;
  }

  public delete(url: string): this {
    this.method = 'DELETE';
    this.url = url;
    return this;
  }

  public withHeader(key: string, value: string): this {
    this.headers[key.toLowerCase()] = value;
    return this;
  }

  public withBearerToken(token: string): this {
    this.headers['authorization'] = `Bearer ${token}`;
    return this;
  }

  public withQuery(key: string, value: string): this {
    this.query[key] = value;
    return this;
  }

  public withBody(body: Record<string, unknown>): this {
    this.body = body;
    return this;
  }

  public build(): BuiltHttpRequest {
    return {
      url: this.url,
      method: this.method,
      headers: { ...this.headers },
      query: { ...this.query },
      body: this.body ? { ...this.body } : null,
    };
  }
}
