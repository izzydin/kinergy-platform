import { ConfigService } from '@nestjs/config';
import { ConfigCorsConfiguration } from '../config-cors-configuration';

describe('ConfigCorsConfiguration', () => {
  it('should return secure default values when ConfigService is not provided', () => {
    const config = new ConfigCorsConfiguration();

    expect(config.getAllowedOrigins()).toEqual(['http://localhost:4200']);
    expect(config.getAllowedMethods()).toEqual([
      'GET',
      'HEAD',
      'PUT',
      'PATCH',
      'POST',
      'DELETE',
      'OPTIONS',
    ]);
    expect(config.getAllowedHeaders()).toContain('Content-Type');
    expect(config.getAllowedHeaders()).toContain('Authorization');
    expect(config.getExposedHeaders()).toContain('X-Request-ID');
    expect(config.getMaxAge()).toBe(86400);
    expect(config.getAllowCredentials()).toBe(true);
    expect(config.getTenantDomainPattern()).toBeNull();
  });

  it('should allow same-origin and server-to-server calls when origin header is absent', () => {
    const config = new ConfigCorsConfiguration();
    expect(config.isOriginAllowed(undefined)).toBe(true);
  });

  it('should validate explicitly whitelisted origins', () => {
    const mockConfigService = {
      get: jest.fn((key: string, defaultValue: unknown) => {
        if (key === 'CORS_ORIGINS') return 'https://app.kinergy.com,https://admin.kinergy.com';
        if (key === 'NODE_ENV') return 'production';
        return defaultValue;
      }),
    } as unknown as ConfigService;

    const config = new ConfigCorsConfiguration(mockConfigService);

    expect(config.isOriginAllowed('https://app.kinergy.com')).toBe(true);
    expect(config.isOriginAllowed('https://admin.kinergy.com')).toBe(true);
    expect(config.isOriginAllowed('https://malicious-site.com')).toBe(false);
  });

  it('should support dynamic multi-tenant domain pattern matching', () => {
    const mockConfigService = {
      get: jest.fn((key: string, defaultValue: unknown) => {
        if (key === 'CORS_ORIGINS') return 'https://app.kinergy.com';
        if (key === 'CORS_TENANT_DOMAIN_PATTERN') return '^https://([a-z0-9-]+)\\.kinergy\\.com$';
        if (key === 'NODE_ENV') return 'production';
        return defaultValue;
      }),
    } as unknown as ConfigService;

    const config = new ConfigCorsConfiguration(mockConfigService);

    expect(config.isOriginAllowed('https://acme-tenant.kinergy.com')).toBe(true);
    expect(config.isOriginAllowed('https://globex-tenant.kinergy.com')).toBe(true);
    expect(config.isOriginAllowed('https://acme-tenant.fake-kinergy.com')).toBe(false);
  });

  it('should allow wildcard in non-production environments when configured', () => {
    const mockConfigService = {
      get: jest.fn((key: string, defaultValue: unknown) => {
        if (key === 'CORS_ORIGINS') return '*';
        if (key === 'NODE_ENV') return 'development';
        return defaultValue;
      }),
    } as unknown as ConfigService;

    const config = new ConfigCorsConfiguration(mockConfigService);
    expect(config.isOriginAllowed('https://any-dev-origin.com')).toBe(true);
  });

  it('should execute createCorsOptions delegate callback correctly', (done) => {
    const mockConfigService = {
      get: jest.fn((key: string, defaultValue: unknown) => {
        if (key === 'CORS_ORIGINS') return 'https://app.kinergy.com';
        return defaultValue;
      }),
    } as unknown as ConfigService;

    const config = new ConfigCorsConfiguration(mockConfigService);
    const corsOptions = config.createCorsOptions();

    expect(typeof corsOptions.origin).toBe('function');
    const originDelegate = corsOptions.origin as (
      origin: string | undefined,
      cb: (err: Error | null, allow?: boolean) => void,
    ) => void;

    originDelegate('https://app.kinergy.com', (err, allow) => {
      expect(err).toBeNull();
      expect(allow).toBe(true);
    });

    originDelegate('https://unauthorized.com', (err) => {
      expect(err).toBeInstanceOf(Error);
      expect(err?.message).toContain('CORS origin not allowed by security policy');
      done();
    });
  });
});
