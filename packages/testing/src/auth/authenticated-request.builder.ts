import { HttpRequestBuilder, BuiltHttpRequest } from '../builders/http-request.builder';
import { JwtTestFactory, JwtTestClaims } from './jwt-test.factory';
import { UserTestFactoryProps } from '../factories/user-test.factory';

export type AuthUserTarget =
  UserTestFactoryProps | JwtTestClaims | Partial<UserTestFactoryProps> | string;

/**
 * Authenticated Request Builder automatically attaching Bearer token and tenant headers.
 */
export class AuthenticatedRequestBuilder {
  private readonly requestBuilder: HttpRequestBuilder;
  private readonly token: string;
  private readonly tenantId?: string | null;

  constructor(target?: AuthUserTarget, secret?: string) {
    this.requestBuilder = new HttpRequestBuilder();

    if (target) {
      this.token = JwtTestFactory.createSignedToken(target, secret);
      if (typeof target === 'object' && target !== null && 'tenantId' in target) {
        this.tenantId = target.tenantId;
      }
    } else {
      this.token = JwtTestFactory.createSignedToken({}, secret);
    }

    this.requestBuilder.withBearerToken(this.token);
    if (this.tenantId) {
      this.requestBuilder.withHeader('x-tenant-id', this.tenantId);
    }
  }

  public get(url: string): this {
    this.requestBuilder.get(url);
    return this;
  }

  public post(url: string): this {
    this.requestBuilder.post(url);
    return this;
  }

  public put(url: string): this {
    this.requestBuilder.put(url);
    return this;
  }

  public patch(url: string): this {
    this.requestBuilder.patch(url);
    return this;
  }

  public delete(url: string): this {
    this.requestBuilder.delete(url);
    return this;
  }

  public withHeader(key: string, value: string): this {
    this.requestBuilder.withHeader(key, value);
    return this;
  }

  public withQuery(key: string, value: string): this {
    this.requestBuilder.withQuery(key, value);
    return this;
  }

  public withBody(body: Record<string, unknown>): this {
    this.requestBuilder.withBody(body);
    return this;
  }

  /**
   * Returns authorization headers object ready for Supertest / Axios / Fetch integration.
   */
  public headers(): Record<string, string> {
    return this.requestBuilder.build().headers;
  }

  /**
   * Returns token string.
   */
  public getToken(): string {
    return this.token;
  }

  /**
   * Builds final HTTP request descriptor.
   */
  public build(): BuiltHttpRequest {
    return this.requestBuilder.build();
  }
}

/**
 * Single-line authentication harness helper.
 * Usage:
 * const owner = createOwner();
 * const request = auth(owner);
 * await request.get('/clients');
 */
export function auth(target?: AuthUserTarget, secret?: string): AuthenticatedRequestBuilder {
  return new AuthenticatedRequestBuilder(target, secret);
}
