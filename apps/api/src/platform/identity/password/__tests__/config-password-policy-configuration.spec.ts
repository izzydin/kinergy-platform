import { ConfigService } from '@nestjs/config';
import { ConfigPasswordPolicyConfiguration } from '../config-password-policy-configuration';

describe('ConfigPasswordPolicyConfiguration', () => {
  it('should return default values when ConfigService is not provided', () => {
    const config = new ConfigPasswordPolicyConfiguration();

    expect(config.getArgon2MemoryCost()).toBe(65536);
    expect(config.getArgon2TimeCost()).toBe(3);
    expect(config.getArgon2Parallelism()).toBe(4);
    expect(config.getArgon2HashLength()).toBe(32);
    expect(config.getMinLength()).toBe(12);
    expect(config.getMaxLength()).toBe(128);
    expect(config.getRequireUppercase()).toBe(true);
    expect(config.getRequireLowercase()).toBe(true);
    expect(config.getRequireNumber()).toBe(true);
    expect(config.getRequireSpecialChar()).toBe(true);
    expect(config.getPasswordHistoryLimit()).toBe(5);
  });

  it('should resolve settings from ConfigService when configured', () => {
    const mockConfigService = {
      get: jest.fn((key: string, defaultValue: unknown) => {
        const values: Record<string, unknown> = {
          ARGON2_MEMORY_COST: 32768,
          ARGON2_TIME_COST: 2,
          ARGON2_PARALLELISM: 2,
          ARGON2_HASH_LENGTH: 64,
          PASSWORD_MIN_LENGTH: 16,
          PASSWORD_MAX_LENGTH: 256,
          PASSWORD_REQUIRE_UPPERCASE: false,
          PASSWORD_REQUIRE_LOWERCASE: true,
          PASSWORD_REQUIRE_NUMBER: true,
          PASSWORD_REQUIRE_SPECIAL_CHAR: false,
          PASSWORD_HISTORY_LIMIT: 10,
        };
        return values[key] ?? defaultValue;
      }),
    } as unknown as ConfigService;

    const config = new ConfigPasswordPolicyConfiguration(mockConfigService);

    expect(config.getArgon2MemoryCost()).toBe(32768);
    expect(config.getArgon2TimeCost()).toBe(2);
    expect(config.getArgon2Parallelism()).toBe(2);
    expect(config.getArgon2HashLength()).toBe(64);
    expect(config.getMinLength()).toBe(16);
    expect(config.getMaxLength()).toBe(256);
    expect(config.getRequireUppercase()).toBe(false);
    expect(config.getRequireLowercase()).toBe(true);
    expect(config.getRequireNumber()).toBe(true);
    expect(config.getRequireSpecialChar()).toBe(false);
    expect(config.getPasswordHistoryLimit()).toBe(10);
  });
});
