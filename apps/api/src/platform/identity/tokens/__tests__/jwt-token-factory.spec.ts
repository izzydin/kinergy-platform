import { ConfigSecretProvider } from '../config-secret-provider';
import { JwtTokenFactory } from '../jwt-token-factory';

describe('JwtTokenFactory', () => {
  let tokenFactory: JwtTokenFactory;

  beforeEach(() => {
    process.env.JWT_ACCESS_SECRET = 'test-jwt-access-secret-at-least-32-chars-long!';
    process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-at-least-32-chars-long!';
    const secretProvider = new ConfigSecretProvider();
    tokenFactory = new JwtTokenFactory(secretProvider);
  });

  describe('Access Token Lifecycle', () => {
    it('should create and verify an access token with claims', async () => {
      const payload = {
        sub: 'user-uuid-123',
        email: 'user@kinergy.platform',
        roles: ['Trainer'],
        permissions: ['clients.read', 'appointments.read'],
        tokenVersion: 1,
        tenantId: 'tenant-999',
      };

      const token = await tokenFactory.createAccessToken(payload);
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);

      const verified = await tokenFactory.verifyAccessToken(token);
      expect(verified.sub).toBe(payload.sub);
      expect(verified.email).toBe(payload.email);
      expect(verified.roles).toEqual(payload.roles);
      expect(verified.permissions).toEqual(payload.permissions);
      expect(verified.tenantId).toBe(payload.tenantId);
      expect(verified.iss).toBe('kinergy-platform');
      expect(verified.aud).toBe('kinergy-api');
    });

    it('should throw an error when verifying invalid token signatures', async () => {
      const invalidToken = 'header.payload.invalid-signature';
      await expect(tokenFactory.verifyAccessToken(invalidToken)).rejects.toThrow();
    });
  });

  describe('Refresh Token Lifecycle', () => {
    it('should create and verify a refresh token with RTR claims', async () => {
      const payload = {
        sub: 'user-uuid-123',
        familyId: 'family-uuid-456',
        jti: 'jti-uuid-789',
        tokenVersion: 2,
        tenantId: 'tenant-999',
      };

      const token = await tokenFactory.createRefreshToken(payload);
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);

      const verified = await tokenFactory.verifyRefreshToken(token);
      expect(verified.sub).toBe(payload.sub);
      expect(verified.familyId).toBe(payload.familyId);
      expect(verified.jti).toBe(payload.jti);
      expect(verified.tokenVersion).toBe(payload.tokenVersion);
    });
  });
});
