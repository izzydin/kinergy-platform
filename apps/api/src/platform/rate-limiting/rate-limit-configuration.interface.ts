/**
 * Configuration port interface for transport-level rate limiting policies.
 * Hides framework environment variables behind an application port.
 */
export interface IRateLimitConfiguration {
  readonly authLoginLimit: number;
  readonly authLoginWindowSeconds: number;
  readonly authRefreshLimit: number;
  readonly authRefreshWindowSeconds: number;
  readonly authLogoutLimit: number;
  readonly authLogoutWindowSeconds: number;
  readonly authMeLimit: number;
  readonly authMeWindowSeconds: number;
}

export const RATE_LIMIT_CONFIGURATION = Symbol('IRateLimitConfiguration');
