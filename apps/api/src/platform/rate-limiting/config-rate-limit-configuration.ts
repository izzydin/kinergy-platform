import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IRateLimitConfiguration } from './rate-limit-configuration.interface';

/**
 * NestJS ConfigService implementation of IRateLimitConfiguration.
 * Reads environment configuration values validated via Zod schema.
 */
@Injectable()
export class ConfigRateLimitConfiguration implements IRateLimitConfiguration {
  constructor(private readonly configService: ConfigService) {}

  get authLoginLimit(): number {
    return this.configService.get<number>('AUTH_LOGIN_LIMIT', 5);
  }

  get authLoginWindowSeconds(): number {
    return this.configService.get<number>('AUTH_LOGIN_WINDOW', 60);
  }

  get authRefreshLimit(): number {
    return this.configService.get<number>('AUTH_REFRESH_LIMIT', 20);
  }

  get authRefreshWindowSeconds(): number {
    return this.configService.get<number>('AUTH_REFRESH_WINDOW', 60);
  }

  get authLogoutLimit(): number {
    return this.configService.get<number>('AUTH_LOGOUT_LIMIT', 30);
  }

  get authLogoutWindowSeconds(): number {
    return this.configService.get<number>('AUTH_LOGOUT_WINDOW', 60);
  }

  get authMeLimit(): number {
    return this.configService.get<number>('AUTH_ME_LIMIT', 60);
  }

  get authMeWindowSeconds(): number {
    return this.configService.get<number>('AUTH_ME_WINDOW', 60);
  }
}
