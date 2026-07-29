import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SecurityConfigurationException } from '../../../config/security-configuration.exception';
import { ISecretProvider } from './secret-provider.interface';

const DEV_DEFAULT_ACCESS_SECRET = 'kinergy-platform-dev-access-secret-min-32-chars!';
const DEV_DEFAULT_REFRESH_SECRET = 'kinergy-platform-dev-refresh-secret-min-32-chars!';

@Injectable()
export class ConfigSecretProvider implements ISecretProvider, OnModuleInit {
  private readonly logger = new Logger(ConfigSecretProvider.name);

  constructor(@Optional() private readonly configService?: ConfigService) {}

  /**
   * Fail-fast application lifecycle hook. Validates security secrets during startup.
   */
  onModuleInit(): void {
    this.logger.log('Validating security environment secrets during application startup...');
    this.getAccessSecret();
    this.getRefreshSecret();
    this.logger.log('Security environment secrets successfully validated.');
  }

  getAccessSecret(): string {
    const nodeEnv = this.getNodeEnv();
    const secret =
      this.configService?.get<string>('JWT_ACCESS_SECRET') || process.env.JWT_ACCESS_SECRET;

    if (!secret || secret.trim().length < 32) {
      throw new SecurityConfigurationException(
        'FATAL SECURITY CONFIGURATION ERROR: JWT_ACCESS_SECRET environment variable is missing or shorter than 32 characters. Application startup aborted.',
      );
    }

    if (nodeEnv === 'production' && secret === DEV_DEFAULT_ACCESS_SECRET) {
      throw new SecurityConfigurationException(
        'FATAL SECURITY CONFIGURATION ERROR: Insecure developer default JWT_ACCESS_SECRET detected in production environment. Application startup aborted.',
      );
    }

    return secret;
  }

  getRefreshSecret(): string {
    const nodeEnv = this.getNodeEnv();
    const secret =
      this.configService?.get<string>('JWT_REFRESH_SECRET') || process.env.JWT_REFRESH_SECRET;

    if (!secret || secret.trim().length < 32) {
      throw new SecurityConfigurationException(
        'FATAL SECURITY CONFIGURATION ERROR: JWT_REFRESH_SECRET environment variable is missing or shorter than 32 characters. Application startup aborted.',
      );
    }

    if (nodeEnv === 'production' && secret === DEV_DEFAULT_REFRESH_SECRET) {
      throw new SecurityConfigurationException(
        'FATAL SECURITY CONFIGURATION ERROR: Insecure developer default JWT_REFRESH_SECRET detected in production environment. Application startup aborted.',
      );
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
