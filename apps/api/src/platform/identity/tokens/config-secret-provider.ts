import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ISecretProvider } from './secret-provider.interface';

@Injectable()
export class ConfigSecretProvider implements ISecretProvider {
  constructor(@Optional() private readonly configService?: ConfigService) {}

  getAccessSecret(): string {
    return (
      this.configService?.get<string>('JWT_ACCESS_SECRET') ||
      process.env.JWT_ACCESS_SECRET ||
      'kinergy-platform-default-dev-access-secret-min-32-chars!'
    );
  }

  getRefreshSecret(): string {
    return (
      this.configService?.get<string>('JWT_REFRESH_SECRET') ||
      process.env.JWT_REFRESH_SECRET ||
      'kinergy-platform-default-dev-refresh-secret-min-32-chars!'
    );
  }

  getAccessExpiresIn(): string {
    return (
      this.configService?.get<string>('JWT_ACCESS_EXPIRES_IN') ||
      process.env.JWT_ACCESS_EXPIRES_IN ||
      '15m'
    );
  }

  getRefreshExpiresIn(): string {
    return (
      this.configService?.get<string>('JWT_REFRESH_EXPIRES_IN') ||
      process.env.JWT_REFRESH_EXPIRES_IN ||
      '7d'
    );
  }

  getIssuer(): string {
    return (
      this.configService?.get<string>('JWT_ISSUER') || process.env.JWT_ISSUER || 'kinergy-platform'
    );
  }

  getAudience(): string {
    return (
      this.configService?.get<string>('JWT_AUDIENCE') || process.env.JWT_AUDIENCE || 'kinergy-api'
    );
  }
}
