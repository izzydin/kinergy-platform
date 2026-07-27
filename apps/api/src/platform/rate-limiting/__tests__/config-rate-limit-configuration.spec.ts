import { ConfigService } from '@nestjs/config';
import { ConfigRateLimitConfiguration } from '../config-rate-limit-configuration';

describe('ConfigRateLimitConfiguration', () => {
  let config: ConfigRateLimitConfiguration;
  let mockConfigService: jest.Mocked<ConfigService>;

  beforeEach(() => {
    mockConfigService = {
      get: jest.fn().mockImplementation((key: string, defaultValue: unknown) => {
        const values: Record<string, unknown> = {
          AUTH_LOGIN_LIMIT: 5,
          AUTH_LOGIN_WINDOW: 60,
          AUTH_REFRESH_LIMIT: 20,
          AUTH_REFRESH_WINDOW: 60,
          AUTH_LOGOUT_LIMIT: 30,
          AUTH_LOGOUT_WINDOW: 60,
          AUTH_ME_LIMIT: 60,
          AUTH_ME_WINDOW: 60,
        };
        return values[key] ?? defaultValue;
      }),
    } as unknown as jest.Mocked<ConfigService>;

    config = new ConfigRateLimitConfiguration(mockConfigService);
  });

  it('should return configured or default rate limits for auth endpoints', () => {
    expect(config.authLoginLimit).toBe(5);
    expect(config.authLoginWindowSeconds).toBe(60);
    expect(config.authRefreshLimit).toBe(20);
    expect(config.authRefreshWindowSeconds).toBe(60);
    expect(config.authLogoutLimit).toBe(30);
    expect(config.authLogoutWindowSeconds).toBe(60);
    expect(config.authMeLimit).toBe(60);
    expect(config.authMeWindowSeconds).toBe(60);
  });
});
