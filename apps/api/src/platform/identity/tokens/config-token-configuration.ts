import { Inject, Injectable } from '@nestjs/common';
import { ISecretProvider, SECRET_PROVIDER } from './secret-provider.interface';
import { ITokenConfiguration, TokenPolicy } from './token-configuration.interface';

/**
 * Utility helper to parse duration strings ('15m', '7d', '1h', '900') into seconds.
 */
export function parseDurationToSeconds(
  duration: string | undefined | null,
  defaultSeconds: number,
): number {
  if (!duration) return defaultSeconds;
  const trimmed = duration.trim();
  const match = trimmed.match(/^(\d+)([smhd])?$/i);
  if (!match || !match[1]) {
    const parsed = parseInt(trimmed, 10);
    return isNaN(parsed) ? defaultSeconds : parsed;
  }
  const value = parseInt(match[1], 10);
  const unit = (match[2] || 's').toLowerCase();
  switch (unit) {
    case 's':
      return value;
    case 'm':
      return value * 60;
    case 'h':
      return value * 3600;
    case 'd':
      return value * 86400;
    default:
      return value;
  }
}

/**
 * Production implementation of ITokenConfiguration.
 * Encapsulates dynamic parsing and configuration retrieval for access and refresh token policies.
 */
@Injectable()
export class ConfigTokenConfiguration implements ITokenConfiguration {
  constructor(
    @Inject(SECRET_PROVIDER)
    private readonly secretProvider: ISecretProvider,
  ) {}

  getAccessTokenTtlSeconds(): number {
    const expiresIn = this.getAccessTokenExpiresInString();
    return parseDurationToSeconds(expiresIn, 900); // Default 15m (900s)
  }

  getAccessTokenTtlMs(): number {
    return this.getAccessTokenTtlSeconds() * 1000;
  }

  getRefreshTokenTtlSeconds(): number {
    const expiresIn = this.getRefreshTokenExpiresInString();
    return parseDurationToSeconds(expiresIn, 604800); // Default 7d (604,800s)
  }

  getRefreshTokenTtlMs(): number {
    return this.getRefreshTokenTtlSeconds() * 1000;
  }

  getAccessTokenExpiresInString(): string {
    return this.secretProvider.getAccessExpiresIn();
  }

  getRefreshTokenExpiresInString(): string {
    return this.secretProvider.getRefreshExpiresIn();
  }

  getIssuer(): string {
    return this.secretProvider.getIssuer();
  }

  getAudience(): string {
    return this.secretProvider.getAudience();
  }

  getClockSkewSeconds(): number {
    return 60; // 60 seconds allowable clock skew
  }

  getTokenPolicy(_tenantId?: string | null): TokenPolicy {
    return {
      accessTokenTtlSeconds: this.getAccessTokenTtlSeconds(),
      refreshTokenTtlSeconds: this.getRefreshTokenTtlSeconds(),
      clockSkewSeconds: this.getClockSkewSeconds(),
      issuer: this.getIssuer(),
      audience: this.getAudience(),
    };
  }
}
