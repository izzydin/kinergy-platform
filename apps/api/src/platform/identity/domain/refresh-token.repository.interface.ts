import { RefreshToken } from './refresh-token.entity';

/**
 * Domain Port Interface for Refresh Token session persistence operations.
 * Decouples use cases and domain logic from database ORMs.
 */
export interface IRefreshTokenRepository {
  save(refreshToken: RefreshToken): Promise<void>;
  findByHash(tokenHash: string): Promise<RefreshToken | null>;
  findByFamilyId(familyId: string): Promise<RefreshToken[]>;
  findByUserId(userId: string): Promise<RefreshToken[]>;
  revokeFamily(familyId: string): Promise<void>;
  revokeAllForUser(userId: string): Promise<void>;
  deleteExpired(now?: Date): Promise<number>;
}

export const REFRESH_TOKEN_REPOSITORY = Symbol('IRefreshTokenRepository');
