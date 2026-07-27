import { User, UserStatus, RefreshToken, IRefreshTokenRepository } from '../../domain';
import { IUserRepository } from '../../domain/user.repository.interface';
import { IAccessTokenService } from '../../tokens/access-token.service';
import { IRefreshTokenService } from '../../tokens/refresh-token.service';
import { Sha256TokenHasher } from '../../tokens/token-hasher.interface';
import { IClock } from '../../../../shared/common/clock.interface';
import { ILoggerPort } from '../../../logging/logger-port.interface';
import { RefreshTokenUseCase } from '../refresh-token.use-case';
import { AccountDisabledException } from '../exceptions/auth.exception';

describe('RefreshTokenUseCase', () => {
  let useCase: RefreshTokenUseCase;
  let mockUserRepository: jest.Mocked<IUserRepository>;
  let mockRefreshTokenRepository: jest.Mocked<IRefreshTokenRepository>;
  let tokenHasher: Sha256TokenHasher;
  let mockAccessTokenService: jest.Mocked<IAccessTokenService>;
  let mockRefreshTokenService: jest.Mocked<IRefreshTokenService>;
  let mockClock: jest.Mocked<IClock>;
  let mockLogger: jest.Mocked<ILoggerPort>;

  const fixedNow = new Date('2026-07-27T12:00:00.000Z');
  const futureExpiry = new Date('2026-08-01T12:00:00.000Z');
  const pastExpiry = new Date('2026-07-20T12:00:00.000Z');

  const rawToken = 'valid_raw_refresh_token';

  const activeUser = new User({
    id: 'usr_123',
    email: 'test@example.com',
    passwordHash: 'hash',
    status: UserStatus.ACTIVE,
    roles: ['USER'],
    permissions: ['read:all'],
    tenantId: 'tenant_1',
    tokenVersion: 1,
  });

  beforeEach(() => {
    tokenHasher = new Sha256TokenHasher();
    const tokenHash = tokenHasher.hashToken(rawToken);

    mockUserRepository = {
      findByEmail: jest.fn(),
      findById: jest.fn().mockResolvedValue(activeUser),
      save: jest.fn().mockResolvedValue(undefined),
      updateRefreshToken: jest.fn().mockResolvedValue(undefined),
    };

    mockRefreshTokenRepository = {
      save: jest.fn().mockResolvedValue(undefined),
      findByHash: jest.fn().mockResolvedValue(
        new RefreshToken({
          id: 'rt_1',
          tokenHash,
          familyId: 'fam_123',
          userId: 'usr_123',
          isRevoked: false,
          expiresAt: futureExpiry,
        }),
      ),
      findByFamilyId: jest.fn(),
      findByUserId: jest.fn(),
      revokeFamily: jest.fn().mockResolvedValue(undefined),
      revokeAllForUser: jest.fn().mockResolvedValue(undefined),
      deleteExpired: jest.fn().mockResolvedValue(0),
    };

    mockAccessTokenService = {
      generateToken: jest.fn().mockResolvedValue('new_access_token'),
      validateToken: jest.fn(),
    };

    mockRefreshTokenService = {
      generateRefreshToken: jest.fn().mockResolvedValue({
        token: 'new_raw_refresh_token',
        jti: 'jti_456',
        familyId: 'fam_123',
      }),
      validateRefreshToken: jest.fn().mockResolvedValue({
        sub: 'usr_123',
        familyId: 'fam_123',
        jti: 'jti_123',
        tokenVersion: 1,
        tenantId: 'tenant_1',
        sessionId: null,
        iat: 100,
        exp: 200,
      }),
      generateOpaqueToken: jest.fn(),
    };

    mockClock = {
      now: jest.fn().mockReturnValue(fixedNow),
    };

    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    useCase = new RefreshTokenUseCase(
      mockUserRepository,
      mockRefreshTokenRepository,
      tokenHasher,
      mockAccessTokenService,
      mockRefreshTokenService,
      mockClock,
      mockLogger,
    );
  });

  it('should rotate refresh token and issue new access token successfully', async () => {
    const result = await useCase.execute({ refreshToken: rawToken });

    expect(mockRefreshTokenService.validateRefreshToken).toHaveBeenCalledWith(rawToken);
    expect(mockRefreshTokenRepository.findByHash).toHaveBeenCalled();
    expect(mockRefreshTokenRepository.save).toHaveBeenCalledTimes(2); // Old revoked + new persisted
    expect(mockAccessTokenService.generateToken).toHaveBeenCalledWith({
      userId: 'usr_123',
      email: 'test@example.com',
      roles: ['USER'],
      permissions: ['read:all'],
      tokenVersion: 1,
      tenantId: 'tenant_1',
    });

    expect(result).toEqual({
      accessToken: 'new_access_token',
      refreshToken: 'new_raw_refresh_token',
      tokenType: 'Bearer',
      expiresIn: 900,
      user: {
        id: 'usr_123',
        email: 'test@example.com',
        status: UserStatus.ACTIVE,
        roles: ['USER'],
        permissions: ['read:all'],
        tenantId: 'tenant_1',
        createdAt: activeUser.createdAt,
        updatedAt: activeUser.updatedAt,
      },
    });
  });

  it('should throw InvalidTokenException and revoke family on replay attack (token not found or revoked)', async () => {
    const revokedToken = new RefreshToken({
      id: 'rt_revoked',
      tokenHash: tokenHasher.hashToken(rawToken),
      familyId: 'fam_123',
      userId: 'usr_123',
      isRevoked: true,
      expiresAt: futureExpiry,
    });
    mockRefreshTokenRepository.findByHash.mockResolvedValue(revokedToken);

    await expect(useCase.execute({ refreshToken: rawToken })).rejects.toThrow(
      'Refresh token reuse detected. Session revoked.',
    );

    expect(mockRefreshTokenRepository.revokeFamily).toHaveBeenCalledWith('fam_123');
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it('should throw InvalidTokenException when stored token has expired', async () => {
    const expiredToken = new RefreshToken({
      id: 'rt_expired',
      tokenHash: tokenHasher.hashToken(rawToken),
      familyId: 'fam_123',
      userId: 'usr_123',
      isRevoked: false,
      expiresAt: pastExpiry,
    });
    mockRefreshTokenRepository.findByHash.mockResolvedValue(expiredToken);

    await expect(useCase.execute({ refreshToken: rawToken })).rejects.toThrow(
      'Refresh token expired.',
    );
    expect(mockRefreshTokenRepository.save).toHaveBeenCalled();
  });

  it('should throw AccountDisabledException if user is not ACTIVE', async () => {
    const suspendedUser = new User({
      id: 'usr_123',
      email: 'test@example.com',
      passwordHash: 'hash',
      status: UserStatus.SUSPENDED,
      roles: ['USER'],
      permissions: [],
    });
    mockUserRepository.findById.mockResolvedValue(suspendedUser);

    await expect(useCase.execute({ refreshToken: rawToken })).rejects.toThrow(
      AccountDisabledException,
    );
    expect(mockRefreshTokenRepository.revokeFamily).toHaveBeenCalledWith('fam_123');
  });
});
