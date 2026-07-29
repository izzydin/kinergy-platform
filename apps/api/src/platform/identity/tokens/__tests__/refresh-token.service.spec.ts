import { ConfigSecretProvider } from '../config-secret-provider';
import { JwtTokenFactory } from '../jwt-token-factory';
import { RefreshTokenService } from '../refresh-token.service';

describe('RefreshTokenService', () => {
  let refreshTokenService: RefreshTokenService;

  beforeEach(() => {
    process.env.JWT_ACCESS_SECRET = 'test-jwt-access-secret-at-least-32-chars-long!';
    process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-at-least-32-chars-long!';
    const secretProvider = new ConfigSecretProvider();
    const tokenFactory = new JwtTokenFactory(secretProvider);
    refreshTokenService = new RefreshTokenService(tokenFactory);
  });

  describe('generateRefreshToken', () => {
    it('should generate a refresh token result with token, jti, and familyId', async () => {
      const result = await refreshTokenService.generateRefreshToken({
        userId: 'user-789',
        tenantId: 'tenant-456',
      });

      expect(typeof result.token).toBe('string');
      expect(result.jti).toBeTruthy();
      expect(result.familyId).toBeTruthy();

      const validated = await refreshTokenService.validateRefreshToken(result.token);
      expect(validated).not.toBeNull();
      expect(validated?.sub).toBe('user-789');
      expect(validated?.jti).toBe(result.jti);
      expect(validated?.familyId).toBe(result.familyId);
    });

    it('should reuse provided familyId during token rotation', async () => {
      const existingFamilyId = 'existing-family-id-123';
      const result = await refreshTokenService.generateRefreshToken({
        userId: 'user-789',
        familyId: existingFamilyId,
      });

      expect(result.familyId).toBe(existingFamilyId);
    });
  });

  describe('generateOpaqueToken', () => {
    it('should generate a 64-character high-entropy hex string (256 bits)', () => {
      const opaque1 = refreshTokenService.generateOpaqueToken();
      const opaque2 = refreshTokenService.generateOpaqueToken();

      expect(opaque1).toHaveLength(64);
      expect(opaque1).not.toEqual(opaque2);
      expect(opaque1).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('validateRefreshToken', () => {
    it('should return null for invalid refresh token', async () => {
      const validated = await refreshTokenService.validateRefreshToken('invalid-refresh-token');
      expect(validated).toBeNull();
    });
  });
});
