import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ITokenFactory, TOKEN_FACTORY } from './token-factory.interface';
import { IAccessTokenPayload } from './token-payload.interface';

export interface IUserIdentityInput {
  userId: string;
  email: string;
  roles: string[];
  permissions: string[];
  tokenVersion?: number;
  tenantId?: string | null;
  organizationId?: string | null;
  sessionId?: string | null;
  mfaState?: boolean;
}

export interface IAccessTokenService {
  generateToken(identity: IUserIdentityInput): Promise<string>;
  validateToken(token: string): Promise<IAccessTokenPayload | null>;
}

export const ACCESS_TOKEN_SERVICE = Symbol('IAccessTokenService');

@Injectable()
export class AccessTokenService implements IAccessTokenService {
  constructor(
    @Inject(TOKEN_FACTORY)
    private readonly tokenFactory: ITokenFactory,
  ) {}

  async generateToken(identity: IUserIdentityInput): Promise<string> {
    const payload: Omit<IAccessTokenPayload, 'iat' | 'exp' | 'iss' | 'aud'> = {
      sub: identity.userId,
      email: identity.email,
      roles: identity.roles,
      permissions: identity.permissions,
      tokenVersion: identity.tokenVersion ?? 1,
      tenantId: identity.tenantId ?? null,
      organizationId: identity.organizationId ?? null,
      sessionId: identity.sessionId ?? null,
      mfaState: identity.mfaState ?? false,
      jti: randomUUID(),
    };

    return this.tokenFactory.createAccessToken(payload);
  }

  async validateToken(token: string): Promise<IAccessTokenPayload | null> {
    if (!token) {
      return null;
    }

    try {
      return await this.tokenFactory.verifyAccessToken(token);
    } catch {
      // Safely return null on expired or invalid signature tokens
      return null;
    }
  }
}
