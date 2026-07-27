import { JwtTestClaims, JwtTestFactory } from './jwt-test.factory';

/**
 * Fluent builder for creating security context claims across complex authorization scenarios.
 */
export class AuthContextBuilder {
  private claims: JwtTestClaims;

  constructor() {
    this.claims = JwtTestFactory.createClaims();
  }

  public withUser(userId: string, email?: string): this {
    this.claims.sub = userId;
    if (email) {
      this.claims.email = email;
    }
    return this;
  }

  public withRoles(...roles: string[]): this {
    this.claims.roles = roles;
    return this;
  }

  public withPermissions(...permissions: string[]): this {
    this.claims.permissions = permissions;
    return this;
  }

  public withTenant(tenantId: string): this {
    this.claims.tenantId = tenantId;
    return this;
  }

  public withTokenVersion(version: number): this {
    this.claims.tokenVersion = version;
    return this;
  }

  public withMfa(state: boolean): this {
    this.claims.mfaState = state;
    return this;
  }

  public buildClaims(): JwtTestClaims {
    return { ...this.claims };
  }

  public buildToken(secret?: string): string {
    return JwtTestFactory.createSignedToken(this.claims, secret);
  }
}
