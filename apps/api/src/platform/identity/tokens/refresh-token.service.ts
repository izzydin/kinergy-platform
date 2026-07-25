import { Inject, Injectable } from '@nestjs/common';
import { randomBytes, randomUUID } from 'crypto';
import { ITokenFactory, TOKEN_FACTORY } from './token-factory.interface';
import { IRefreshTokenPayload } from './token-payload.interface';

export interface IRefreshTokenInput {
  userId: string;
  familyId?: string;
  tokenVersion?: number;
  tenantId?: string | null;
  sessionId?: string | null;
}

export interface IRefreshTokenResult {
  token: string;
  jti: string;
  familyId: string;
}

export interface IRefreshTokenService {
  generateRefreshToken(params: IRefreshTokenInput): Promise<IRefreshTokenResult>;
  validateRefreshToken(token: string): Promise<IRefreshTokenPayload | null>;
  generateOpaqueToken(): string;
}

export const REFRESH_TOKEN_SERVICE = Symbol('IRefreshTokenService');

@Injectable()
export class RefreshTokenService implements IRefreshTokenService {
  constructor(
    @Inject(TOKEN_FACTORY)
    private readonly tokenFactory: ITokenFactory,
  ) {}

  async generateRefreshToken(params: IRefreshTokenInput): Promise<IRefreshTokenResult> {
    const jti = randomUUID();
    const familyId = params.familyId ?? randomUUID();

    const payload: Omit<IRefreshTokenPayload, 'iat' | 'exp' | 'iss' | 'aud'> = {
      sub: params.userId,
      familyId,
      jti,
      tokenVersion: params.tokenVersion ?? 1,
      tenantId: params.tenantId ?? null,
      sessionId: params.sessionId ?? null,
    };

    const token = await this.tokenFactory.createRefreshToken(payload);

    return {
      token,
      jti,
      familyId,
    };
  }

  async validateRefreshToken(token: string): Promise<IRefreshTokenPayload | null> {
    if (!token) {
      return null;
    }

    try {
      return await this.tokenFactory.verifyRefreshToken(token);
    } catch {
      // Safely return null on expired or invalid signature tokens
      return null;
    }
  }

  /**
   * Generates a high-entropy 256-bit CSPRNG opaque random string.
   */
  generateOpaqueToken(): string {
    return randomBytes(32).toString('hex');
  }
}
