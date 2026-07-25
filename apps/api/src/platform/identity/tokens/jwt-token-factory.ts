import { Inject, Injectable } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { ISecretProvider, SECRET_PROVIDER } from './secret-provider.interface';
import { ITokenFactory } from './token-factory.interface';
import { IAccessTokenPayload, IRefreshTokenPayload } from './token-payload.interface';

@Injectable()
export class JwtTokenFactory implements ITokenFactory {
  constructor(
    @Inject(SECRET_PROVIDER)
    private readonly secretProvider: ISecretProvider,
  ) {}

  async createAccessToken(
    payload: Omit<IAccessTokenPayload, 'iat' | 'exp' | 'iss' | 'aud'>,
  ): Promise<string> {
    const secret = this.secretProvider.getAccessSecret();
    const expiresIn = this.secretProvider.getAccessExpiresIn();
    const issuer = this.secretProvider.getIssuer();
    const audience = this.secretProvider.getAudience();

    return jwt.sign(payload, secret, {
      expiresIn: expiresIn as jwt.SignOptions['expiresIn'],
      issuer,
      audience,
      algorithm: 'HS256',
    });
  }

  async verifyAccessToken(token: string): Promise<IAccessTokenPayload> {
    const secret = this.secretProvider.getAccessSecret();
    const issuer = this.secretProvider.getIssuer();
    const audience = this.secretProvider.getAudience();

    const decoded = jwt.verify(token, secret, {
      issuer,
      audience,
      algorithms: ['HS256'],
    });

    return decoded as unknown as IAccessTokenPayload;
  }

  async createRefreshToken(
    payload: Omit<IRefreshTokenPayload, 'iat' | 'exp' | 'iss' | 'aud'>,
  ): Promise<string> {
    const secret = this.secretProvider.getRefreshSecret();
    const expiresIn = this.secretProvider.getRefreshExpiresIn();
    const issuer = this.secretProvider.getIssuer();
    const audience = this.secretProvider.getAudience();

    return jwt.sign(payload, secret, {
      expiresIn: expiresIn as jwt.SignOptions['expiresIn'],
      issuer,
      audience,
      algorithm: 'HS256',
    });
  }

  async verifyRefreshToken(token: string): Promise<IRefreshTokenPayload> {
    const secret = this.secretProvider.getRefreshSecret();
    const issuer = this.secretProvider.getIssuer();
    const audience = this.secretProvider.getAudience();

    const decoded = jwt.verify(token, secret, {
      issuer,
      audience,
      algorithms: ['HS256'],
    });

    return decoded as unknown as IRefreshTokenPayload;
  }
}
