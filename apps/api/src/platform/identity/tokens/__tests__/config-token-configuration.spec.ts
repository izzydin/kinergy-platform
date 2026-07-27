import { ConfigTokenConfiguration, parseDurationToSeconds } from '../config-token-configuration';
import { ISecretProvider } from '../secret-provider.interface';

describe('ConfigTokenConfiguration', () => {
  let mockSecretProvider: jest.Mocked<ISecretProvider>;
  let tokenConfiguration: ConfigTokenConfiguration;

  beforeEach(() => {
    mockSecretProvider = {
      getAccessSecret: jest.fn().mockReturnValue('access_secret_32_chars_long_spec!'),
      getRefreshSecret: jest.fn().mockReturnValue('refresh_secret_32_chars_long_spec'),
      getAccessExpiresIn: jest.fn().mockReturnValue('15m'),
      getRefreshExpiresIn: jest.fn().mockReturnValue('7d'),
      getIssuer: jest.fn().mockReturnValue('kinergy-platform'),
      getAudience: jest.fn().mockReturnValue('kinergy-api'),
    };

    tokenConfiguration = new ConfigTokenConfiguration(mockSecretProvider);
  });

  describe('Duration Parsing Utilities', () => {
    it('should parse minutes, hours, days, and seconds strings cleanly', () => {
      expect(parseDurationToSeconds('15m', 900)).toBe(900);
      expect(parseDurationToSeconds('1h', 3600)).toBe(3600);
      expect(parseDurationToSeconds('7d', 604800)).toBe(604800);
      expect(parseDurationToSeconds('30s', 30)).toBe(30);
      expect(parseDurationToSeconds('120', 120)).toBe(120);
    });

    it('should fall back to default when duration string is invalid', () => {
      expect(parseDurationToSeconds('invalid', 900)).toBe(900);
      expect(parseDurationToSeconds('', 604800)).toBe(604800);
    });
  });

  describe('ITokenConfiguration Policy Methods', () => {
    it('should return correct Access Token TTL in seconds and milliseconds', () => {
      expect(tokenConfiguration.getAccessTokenTtlSeconds()).toBe(900);
      expect(tokenConfiguration.getAccessTokenTtlMs()).toBe(900000);
    });

    it('should return correct Refresh Token TTL in seconds and milliseconds', () => {
      expect(tokenConfiguration.getRefreshTokenTtlSeconds()).toBe(604800);
      expect(tokenConfiguration.getRefreshTokenTtlMs()).toBe(604800000);
    });

    it('should return metadata for issuer, audience, and clock skew', () => {
      expect(tokenConfiguration.getIssuer()).toBe('kinergy-platform');
      expect(tokenConfiguration.getAudience()).toBe('kinergy-api');
      expect(tokenConfiguration.getClockSkewSeconds()).toBe(60);
    });

    it('should build complete TokenPolicy structure for future tenant policy overrides', () => {
      const policy = tokenConfiguration.getTokenPolicy('tenant_123');

      expect(policy.accessTokenTtlSeconds).toBe(900);
      expect(policy.refreshTokenTtlSeconds).toBe(604800);
      expect(policy.clockSkewSeconds).toBe(60);
      expect(policy.issuer).toBe('kinergy-platform');
      expect(policy.audience).toBe('kinergy-api');
    });
  });
});
