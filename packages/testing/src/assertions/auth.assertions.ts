export interface HttpResponseLike {
  status?: number;
  statusCode?: number;
  body?: unknown;
}

/**
 * Assertions for HTTP Authentication & Authorization responses.
 */
export class AuthAssertions {
  private static extractStatus(res: HttpResponseLike): number {
    return res.status ?? res.statusCode ?? 0;
  }

  /**
   * Asserts that an HTTP response succeeded without authentication or permission errors.
   */
  public static expectAuthenticated(res: HttpResponseLike): void {
    const status = this.extractStatus(res);
    if (status === 401 || status === 403) {
      throw new Error(
        `Expected request to be authenticated, but failed with status ${status}: ${JSON.stringify(res.body)}`,
      );
    }
  }

  /**
   * Asserts that an HTTP response failed with 401 Unauthorized.
   */
  public static expectUnauthorized(res: HttpResponseLike): void {
    const status = this.extractStatus(res);
    if (status !== 401) {
      throw new Error(`Expected HTTP status 401 Unauthorized, but received status ${status}.`);
    }
  }

  /**
   * Asserts that an HTTP response failed with 403 Forbidden.
   */
  public static expectForbidden(res: HttpResponseLike): void {
    const status = this.extractStatus(res);
    if (status !== 403) {
      throw new Error(`Expected HTTP status 403 Forbidden, but received status ${status}.`);
    }
  }
}
