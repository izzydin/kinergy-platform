import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SecurityConfigurationException } from '../../../config/security-configuration.exception';
import { ISecretProvider } from './secret-provider.interface';

const DEV_ACCESS_SECRET_FALLBACK = 'kinergy-platform-default-dev-access-secret-min-32-chars!';
const DEV_REFRESH_SECRET_FALLBACK = 'kinergy-platform-default-dev-refresh-secret-min-32-chars!';

@Injectable()
export class ConfigSecretProvider implements ISecretProvider {
  private readonly logger = new Logger(ConfigSecretProvider.name);

  constructor(@Optional() private readonly configService?: ConfigService) {}

  getAccessSecret(): string {
    const nodeEnv = this.getNodeEnv();
    const secret =
      this.configService?.get<string>('JWT_ACCESS_SECRET') || process.env.JWT_ACCESS_SECRET;

    if (nodeEnv === 'production') {
      if (!secret || secret.trim().length < 32) {
        throw new SecurityConfigurationException(
          'FATAL SECURITY CONFIGURATION ERROR: JWT_ACCESS_SECRET environment variable is missing or insecure in production mode. Application startup aborted.',
        );
      }
      return secret;
    }

    if (!secret) {
      this.logger.warn(
        'SECURITY WARNING: JWT_ACCESS_SECRET is missing. Using developer default secret for non-production environment.',
      );
      return DEV_ACCESS_SECRET_FALLBACK;
    }

    return secret;
  }

  getRefreshSecret(): string {
    const nodeEnv = this.getNodeEnv();
    const secret =
      this.configService?.get<string>('JWT_REFRESH_SECRET') || process.env.JWT_REFRESH_SECRET;

    if (nodeEnv === 'production') {
      if (!secret || secret.trim().length < 32) {
        throw new SecurityConfigurationException(
          'FATAL SECURITY CONFIGURATION ERROR: JWT_REFRESH_SECRET environment variable is missing or insecure in production mode. Application startup aborted.',
        );
      }
      return secret;
    }

    if (!secret) {
      this.logger.warn(
        'SECURITY WARNING: JWT_REFRESH_SECRET is missing. Using developer default secret for non-production environment.',
      );
      return DEV_REFRESH_SECRET_FALLBACK;
    }

    return secret;
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

  private getNodeEnv(): string {
    return (
      this.configService?.get<string>('NODE_ENV') ||
      process.env.NODE_ENV ||
      'development'
    ).toLowerCase();
  }
}
