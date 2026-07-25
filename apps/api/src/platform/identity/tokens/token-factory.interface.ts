import { IAccessTokenPayload, IRefreshTokenPayload } from './token-payload.interface';

/**
 * Abstract Port Interface for JWT Token Creation and Verification.
 * Encapsulates low-level JWT signing libraries behind clean domain methods.
 */
export interface ITokenFactory {
  /**
   * Mints an Access Token with given payload claims.
   */
  createAccessToken(
    payload: Omit<IAccessTokenPayload, 'iat' | 'exp' | 'iss' | 'aud'>,
  ): Promise<string>;

  /**
   * Verifies and decodes an Access Token. Throws error if invalid or expired.
   */
  verifyAccessToken(token: string): Promise<IAccessTokenPayload>;

  /**
   * Mints a Refresh Token with given payload claims.
   */
  createRefreshToken(
    payload: Omit<IRefreshTokenPayload, 'iat' | 'exp' | 'iss' | 'aud'>,
  ): Promise<string>;

  /**
   * Verifies and decodes a Refresh Token. Throws error if invalid or expired.
   */
  verifyRefreshToken(token: string): Promise<IRefreshTokenPayload>;
}

/**
 * Dependency Injection Symbol for NestJS binding.
 */
export const TOKEN_FACTORY = Symbol('ITokenFactory');
