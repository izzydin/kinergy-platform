import { AccessTokenService } from '../access-token.service';
import { ConfigSecretProvider } from '../config-secret-provider';
import { JwtTokenFactory } from '../jwt-token-factory';

describe('AccessTokenService', () => {
  let accessTokenService: AccessTokenService;

  beforeEach(() => {
    const secretProvider = new ConfigSecretProvider();
    const tokenFactory = new JwtTokenFactory(secretProvider);
    accessTokenService = new AccessTokenService(tokenFactory);
  });

  it('should generate a valid access token for an identity input', async () => {
    const identity = {
      userId: 'user-123',
      email: 'owner@kinergy.platform',
      roles: ['Owner'],
      permissions: ['*:*:*'],
      tenantId: 'tenant-1',
    };

    const token = await accessTokenService.generateToken(identity);
    expect(typeof token).toBe('string');

    const validated = await accessTokenService.validateToken(token);
    expect(validated).not.toBeNull();
    expect(validated?.sub).toBe(identity.userId);
    expect(validated?.email).toBe(identity.email);
    expect(validated?.roles).toContain('Owner');
    expect(validated?.permissions).toContain('*:*:*');
    expect(validated?.jti).toBeTruthy();
  });

  it('should return null when validating an invalid or expired token string', async () => {
    const validated = await accessTokenService.validateToken('invalid.token.string');
    expect(validated).toBeNull();
  });

  it('should return null for empty token string', async () => {
    expect(await accessTokenService.validateToken('')).toBeNull();
  });
});
