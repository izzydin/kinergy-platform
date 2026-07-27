/**
 * Policy settings for token generation and lifecycle verification.
 */
export interface TokenPolicy {
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  clockSkewSeconds: number;
  issuer: string;
  audience: string;
}

/**
 * Abstract Port Interface for Token Lifecycle Configuration & Expiration Policies.
 * Decouples use cases and domain logic from hardcoded duration literals and environment lookups.
 */
export interface ITokenConfiguration {
  getAccessTokenTtlSeconds(): number;
  getAccessTokenTtlMs(): number;
  getRefreshTokenTtlSeconds(): number;
  getRefreshTokenTtlMs(): number;
  getAccessTokenExpiresInString(): string;
  getRefreshTokenExpiresInString(): string;
  getIssuer(): string;
  getAudience(): string;
  getClockSkewSeconds(): number;

  /**
   * Retrieves policy settings, supporting future tenant or client-type overrides.
   */
  getTokenPolicy(tenantId?: string | null): TokenPolicy;
}

/**
 * Dependency Injection Symbol for NestJS binding.
 */
export const TOKEN_CONFIGURATION = Symbol('ITokenConfiguration');
