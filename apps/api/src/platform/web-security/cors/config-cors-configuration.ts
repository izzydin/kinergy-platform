import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { ICorsConfiguration } from './cors-configuration.interface';

/**
 * Production-ready NestJS ConfigService implementation of ICorsConfiguration.
 * Supports environment-driven origins, multi-tenant regex patterns,
 * strict production non-wildcard enforcement, and preflight caching options.
 */
@Injectable()
export class ConfigCorsConfiguration implements ICorsConfiguration {
  constructor(@Optional() private readonly configService?: ConfigService) {}

  getAllowedOrigins(): string[] {
    const raw = this.configService?.get<string>('CORS_ORIGINS', 'http://localhost:4200');
    if (!raw) return ['http://localhost:4200'];
    return raw
      .split(',')
      .map((o) => o.trim())
      .filter((o) => o.length > 0);
  }

  getAllowedMethods(): string[] {
    const raw = this.configService?.get<string>(
      'CORS_ALLOWED_METHODS',
      'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    );
    if (!raw) return ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'];
    return raw
      .split(',')
      .map((m) => m.trim())
      .filter((m) => m.length > 0);
  }

  getAllowedHeaders(): string[] {
    const raw = this.configService?.get<string>(
      'CORS_ALLOWED_HEADERS',
      'Content-Type,Authorization,X-Requested-With,Accept,Origin,X-Tenant-ID',
    );
    if (!raw)
      return [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'Accept',
        'Origin',
        'X-Tenant-ID',
      ];
    return raw
      .split(',')
      .map((h) => h.trim())
      .filter((h) => h.length > 0);
  }

  getExposedHeaders(): string[] {
    const raw = this.configService?.get<string>(
      'CORS_EXPOSED_HEADERS',
      'Content-Range,X-Content-Range,X-Total-Count,X-Request-ID',
    );
    if (!raw) return ['Content-Range', 'X-Content-Range', 'X-Total-Count', 'X-Request-ID'];
    return raw
      .split(',')
      .map((h) => h.trim())
      .filter((h) => h.length > 0);
  }

  getMaxAge(): number {
    return this.configService?.get<number>('CORS_MAX_AGE', 86400) ?? 86400;
  }

  getAllowCredentials(): boolean {
    return this.configService?.get<boolean>('CORS_ALLOW_CREDENTIALS', true) ?? true;
  }

  getTenantDomainPattern(): RegExp | null {
    const patternStr = this.configService?.get<string>('CORS_TENANT_DOMAIN_PATTERN');
    if (!patternStr || patternStr.trim().length === 0) {
      return null;
    }
    try {
      return new RegExp(patternStr.trim(), 'i');
    } catch {
      return null;
    }
  }

  /**
   * Evaluates if a given incoming request origin is permitted.
   * Allows same-origin / server-to-server requests (origin is undefined).
   * Checks explicit whitelist origins and dynamic multi-tenant domain regex.
   */
  isOriginAllowed(origin: string | undefined): boolean {
    // 1. Same-origin, mobile apps, Postman, or server-to-server calls
    if (!origin) {
      return true;
    }

    const origins = this.getAllowedOrigins();
    const env = this.configService?.get<string>('NODE_ENV', 'development');

    // 2. Wildcard allowed ONLY in non-production environments
    if (env !== 'production' && origins.includes('*')) {
      return true;
    }

    // 3. Explicit whitelist matching
    if (origins.includes(origin)) {
      return true;
    }

    // 4. Multi-tenant domain regex matching
    const tenantPattern = this.getTenantDomainPattern();
    if (tenantPattern && tenantPattern.test(origin)) {
      return true;
    }

    return false;
  }

  /**
   * Generates dynamic CorsOptions for NestJS app.enableCors()
   */
  createCorsOptions(): CorsOptions {
    return {
      origin: (
        origin: string | undefined,
        callback: (err: Error | null, allow?: boolean) => void,
      ) => {
        if (this.isOriginAllowed(origin)) {
          callback(null, true);
        } else {
          callback(new Error(`CORS origin not allowed by security policy: ${origin}`));
        }
      },
      methods: this.getAllowedMethods(),
      allowedHeaders: this.getAllowedHeaders(),
      exposedHeaders: this.getExposedHeaders(),
      credentials: this.getAllowCredentials(),
      maxAge: this.getMaxAge(),
      preflightContinue: false,
      optionsSuccessStatus: 204,
    };
  }
}
