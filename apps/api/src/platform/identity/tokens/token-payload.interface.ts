/**
 * Access Token Payload Interface.
 * Encapsulates standard and domain JWT claims for authenticated API calls.
 */
export interface IAccessTokenPayload {
  sub: string; // userId
  email: string;
  roles: string[];
  permissions: string[];
  tokenVersion: number;
  tenantId?: string | null;
  organizationId?: string | null;
  sessionId?: string | null;
  mfaState?: boolean;
  jti?: string;
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string;
}

/**
 * Refresh Token Payload Interface.
 * Encapsulates claims required for Refresh Token Rotation (RTR) and session management.
 */
export interface IRefreshTokenPayload {
  sub: string; // userId
  familyId: string;
  jti: string;
  tokenVersion: number;
  tenantId?: string | null;
  sessionId?: string | null;
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string;
}
