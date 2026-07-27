import { JwtTestClaims, JwtTestFactory } from './jwt-test.factory';

/**
 * Mock helper for injecting security claims into NestJS test contexts and request objects.
 */
export class SecurityContextTestMock {
  /**
   * Mocks an authenticated request object with user security claims.
   */
  public static createAuthenticatedRequest(claimsOverriding?: Partial<JwtTestClaims>) {
    const claims = JwtTestFactory.createClaims(claimsOverriding);
    return {
      user: {
        userId: claims.sub,
        email: claims.email,
        roles: claims.roles,
        permissions: claims.permissions,
        tenantId: claims.tenantId,
        tokenVersion: claims.tokenVersion,
      },
      headers: {
        authorization: `Bearer ${JwtTestFactory.createMockToken(claims)}`,
      },
    };
  }
}
