import { ConfigService } from '@nestjs/config';
import { SecurityConfigurationException } from '../../../../config/security-configuration.exception';
import { ConfigSecretProvider } from '../config-secret-provider';

describe('ConfigSecretProvider', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('Non-Production Environments (development / test)', () => {
    it('should return configured secrets when environment variables are set', () => {
      process.env.NODE_ENV = 'development';
      process.env.JWT_ACCESS_SECRET = 'custom-dev-access-secret-min-32-chars!!';
      process.env.JWT_REFRESH_SECRET = 'custom-dev-refresh-secret-min-32-chars!';

      const provider = new ConfigSecretProvider();

      expect(provider.getAccessSecret()).toBe('custom-dev-access-secret-min-32-chars!!');
      expect(provider.getRefreshSecret()).toBe('custom-dev-refresh-secret-min-32-chars!');
    });

    it('should use documented developer fallbacks in development mode when secrets are omitted', () => {
      delete process.env.JWT_ACCESS_SECRET;
      delete process.env.JWT_REFRESH_SECRET;
      process.env.NODE_ENV = 'development';

      const provider = new ConfigSecretProvider();

      expect(provider.getAccessSecret()).toBe(
        'kinergy-platform-default-dev-access-secret-min-32-chars!',
      );
      expect(provider.getRefreshSecret()).toBe(
        'kinergy-platform-default-dev-refresh-secret-min-32-chars!',
      );
    });

    it('should resolve secrets via injected ConfigService', () => {
      const mockConfigService = {
        get: jest.fn((key: string) => {
          if (key === 'NODE_ENV') return 'development';
          if (key === 'JWT_ACCESS_SECRET') return 'config-service-access-secret-32-chars';
          if (key === 'JWT_REFRESH_SECRET') return 'config-service-refresh-secret-32-chars';
          return undefined;
        }),
      } as unknown as ConfigService;

      const provider = new ConfigSecretProvider(mockConfigService);

      expect(provider.getAccessSecret()).toBe('config-service-access-secret-32-chars');
      expect(provider.getRefreshSecret()).toBe('config-service-refresh-secret-32-chars');
    });
  });

  describe('Production Environment Hardening (NODE_ENV = production)', () => {
    it('should return valid configured secrets in production mode', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_ACCESS_SECRET = 'production-access-secret-min-32-chars-long!';
      process.env.JWT_REFRESH_SECRET = 'production-refresh-secret-min-32-chars-long!';

      const provider = new ConfigSecretProvider();

      expect(provider.getAccessSecret()).toBe('production-access-secret-min-32-chars-long!');
      expect(provider.getRefreshSecret()).toBe('production-refresh-secret-min-32-chars-long!');
    });

    it('should throw SecurityConfigurationException in production if JWT_ACCESS_SECRET is missing', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.JWT_ACCESS_SECRET;
      process.env.JWT_REFRESH_SECRET = 'production-refresh-secret-min-32-chars-long!';

      const provider = new ConfigSecretProvider();

      expect(() => provider.getAccessSecret()).toThrow(SecurityConfigurationException);
      expect(() => provider.getAccessSecret()).toThrow(
        'JWT_ACCESS_SECRET environment variable is missing or insecure in production mode',
      );
    });

    it('should throw SecurityConfigurationException in production if JWT_REFRESH_SECRET is missing', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_ACCESS_SECRET = 'production-access-secret-min-32-chars-long!';
      delete process.env.JWT_REFRESH_SECRET;

      const provider = new ConfigSecretProvider();

      expect(() => provider.getRefreshSecret()).toThrow(SecurityConfigurationException);
      expect(() => provider.getRefreshSecret()).toThrow(
        'JWT_REFRESH_SECRET environment variable is missing or insecure in production mode',
      );
    });

    it('should throw SecurityConfigurationException in production if secret length is less than 32 characters', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_ACCESS_SECRET = 'short-secret';
      process.env.JWT_REFRESH_SECRET = 'production-refresh-secret-min-32-chars-long!';

      const provider = new ConfigSecretProvider();

      expect(() => provider.getAccessSecret()).toThrow(SecurityConfigurationException);
    });
  });

  describe('Default Token Metadata Policies', () => {
    it('should provide default expiration, issuer, and audience policies', () => {
      const provider = new ConfigSecretProvider();

      expect(provider.getAccessExpiresIn()).toBe('15m');
      expect(provider.getRefreshExpiresIn()).toBe('7d');
      expect(provider.getIssuer()).toBe('kinergy-platform');
      expect(provider.getAudience()).toBe('kinergy-api');
    });
  });
});
