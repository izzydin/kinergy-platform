import { ConfigSecretProvider } from '../config-secret-provider';

describe('ConfigSecretProvider', () => {
  let secretProvider: ConfigSecretProvider;

  beforeEach(() => {
    secretProvider = new ConfigSecretProvider();
  });

  it('should provide non-empty access secret', () => {
    const secret = secretProvider.getAccessSecret();
    expect(secret).toBeTruthy();
    expect(typeof secret).toBe('string');
  });

  it('should provide non-empty refresh secret', () => {
    const secret = secretProvider.getRefreshSecret();
    expect(secret).toBeTruthy();
    expect(typeof secret).toBe('string');
  });

  it('should provide default expiration policies', () => {
    expect(secretProvider.getAccessExpiresIn()).toBe('15m');
    expect(secretProvider.getRefreshExpiresIn()).toBe('7d');
  });

  it('should provide issuer and audience metadata', () => {
    expect(secretProvider.getIssuer()).toBe('kinergy-platform');
    expect(secretProvider.getAudience()).toBe('kinergy-api');
  });
});
