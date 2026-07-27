import { RandomTestData } from '../utils/random-test-data.util';

export interface JwtTestClaims {
  sub: string;
  email: string;
  roles: string[];
  permissions: string[];
  tenantId?: string | null;
  tokenVersion?: number;
  iat?: number;
  exp?: number;
}

/**
 * Factory for creating mock JWT claims and signed token strings for test suites.
 */
export class JwtTestFactory {
  /**
   * Generates mock claims payload.
   */
  public static createClaims(overrides?: Partial<JwtTestClaims>): JwtTestClaims {
    const nowSec = Math.floor(Date.now() / 1000);
    return {
      sub: overrides?.sub ?? RandomTestData.uuid(),
      email: overrides?.email ?? RandomTestData.email(),
      roles: overrides?.roles ?? ['USER'],
      permissions: overrides?.permissions ?? ['read:own'],
      tenantId: overrides?.tenantId ?? 'tenant_test_1',
      tokenVersion: overrides?.tokenVersion ?? 1,
      iat: overrides?.iat ?? nowSec,
      exp: overrides?.exp ?? nowSec + 3600,
    };
  }

  /**
   * Generates a un-verified mock JWT token string (header.payload.signature) for testing HTTP headers.
   */
  public static createMockToken(claims?: Partial<JwtTestClaims>): string {
    const payload = this.createClaims(claims);
    const header = { alg: 'HS256', typ: 'JWT' };
    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const mockSignature = Buffer.from('mock_test_signature').toString('base64url');

    return `${encodedHeader}.${encodedPayload}.${mockSignature}`;
  }
}
