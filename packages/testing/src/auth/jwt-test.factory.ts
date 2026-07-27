import * as jwt from 'jsonwebtoken';
import { RandomTestData } from '../utils/random-test-data.util';
import { UserTestFactoryProps } from '../factories/user-test.factory';

export interface JwtTestClaims {
  sub: string;
  email: string;
  roles: string[];
  permissions: string[];
  tenantId?: string | null;
  organizationId?: string | null;
  sessionId?: string | null;
  tokenVersion?: number;
  mfaState?: boolean;
  jti?: string;
  iat?: number;
  exp?: number;
}

export const DEFAULT_TEST_JWT_SECRET =
  process.env['JWT_ACCESS_SECRET'] || 'kynergy-dev-jwt-access-secret-minimum-32-chars-long';
export const DEFAULT_TEST_ISSUER = 'kynergy-identity-service';
export const DEFAULT_TEST_AUDIENCE = 'kynergy-platform-clients';

/**
 * Factory for creating mock claims and cryptographically signed production-grade JWT tokens for test suites.
 */
export class JwtTestFactory {
  /**
   * Generates mock JWT claims payload.
   */
  public static createClaims(overrides?: Partial<JwtTestClaims>): JwtTestClaims {
    const nowSec = Math.floor(Date.now() / 1000);
    return {
      sub: overrides?.sub ?? RandomTestData.uuid(),
      email: overrides?.email ?? RandomTestData.email(),
      roles: overrides?.roles ?? ['USER'],
      permissions: overrides?.permissions ?? ['read:own'],
      tenantId: overrides?.tenantId ?? 'tenant_test_1',
      organizationId: overrides?.organizationId ?? null,
      sessionId: overrides?.sessionId ?? null,
      tokenVersion: overrides?.tokenVersion ?? 1,
      mfaState: overrides?.mfaState ?? false,
      jti: overrides?.jti ?? RandomTestData.uuid(),
      iat: overrides?.iat ?? nowSec,
      exp: overrides?.exp ?? nowSec + 3600,
    };
  }

  /**
   * Creates a cryptographically signed JWT token matching production algorithm, issuer, and audience.
   */
  public static createSignedToken(
    userOrClaims?: Partial<UserTestFactoryProps> | Partial<JwtTestClaims> | string,
    secret = DEFAULT_TEST_JWT_SECRET,
  ): string {
    let claims: JwtTestClaims;

    if (typeof userOrClaims === 'string') {
      claims = this.createClaims({ sub: userOrClaims });
    } else if (userOrClaims && 'id' in userOrClaims) {
      claims = this.createClaims({
        sub: userOrClaims.id,
        email: userOrClaims.email,
        roles: userOrClaims.roles,
        permissions: userOrClaims.permissions,
        tenantId: userOrClaims.tenantId,
        tokenVersion: userOrClaims.tokenVersion,
      });
    } else {
      claims = this.createClaims(userOrClaims as Partial<JwtTestClaims>);
    }

    const {
      sub,
      email,
      roles,
      permissions,
      tenantId,
      organizationId,
      sessionId,
      tokenVersion,
      mfaState,
      jti,
    } = claims;

    const payload = {
      sub,
      email,
      roles,
      permissions,
      tenantId: tenantId ?? null,
      organizationId: organizationId ?? null,
      sessionId: sessionId ?? null,
      tokenVersion: tokenVersion ?? 1,
      mfaState: mfaState ?? false,
      jti: jti ?? RandomTestData.uuid(),
    };

    return jwt.sign(payload, secret, {
      expiresIn: '1h',
      issuer: DEFAULT_TEST_ISSUER,
      audience: DEFAULT_TEST_AUDIENCE,
      algorithm: 'HS256',
    });
  }

  /**
   * Generates an expired signed JWT token for security failure tests.
   */
  public static createExpiredToken(
    userOrClaims?: Partial<UserTestFactoryProps> | Partial<JwtTestClaims>,
    secret = DEFAULT_TEST_JWT_SECRET,
  ): string {
    const claims = this.createClaims(
      userOrClaims && 'id' in userOrClaims
        ? { sub: userOrClaims.id, email: userOrClaims.email }
        : (userOrClaims as Partial<JwtTestClaims>),
    );

    return jwt.sign(claims, secret, {
      expiresIn: '-1s',
      issuer: DEFAULT_TEST_ISSUER,
      audience: DEFAULT_TEST_AUDIENCE,
      algorithm: 'HS256',
    });
  }

  /**
   * Unsigned mock token string for fast unit tests.
   */
  public static createMockToken(claims?: Partial<JwtTestClaims>): string {
    return this.createSignedToken(claims);
  }
}
