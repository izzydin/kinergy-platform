import { User, UserStatus } from '../../domain';
import { IUserRepository } from '../../domain/user.repository.interface';
import { IPasswordHasher } from '../../password/password-hasher.interface';
import { IAccessTokenService } from '../../tokens/access-token.service';
import { IRefreshTokenService } from '../../tokens/refresh-token.service';
import { IClock } from '../../../../shared/common/clock.interface';
import { ILoggerPort } from '../../../logging/logger-port.interface';
import { RefreshTokenUseCase } from '../refresh-token.use-case';
import { AccountDisabledException, InvalidTokenException } from '../exceptions/auth.exception';

describe('RefreshTokenUseCase', () => {
  let useCase: RefreshTokenUseCase;
  let mockUserRepository: jest.Mocked<IUserRepository>;
  let mockPasswordHasher: jest.Mocked<IPasswordHasher>;
  let mockAccessTokenService: jest.Mocked<IAccessTokenService>;
  let mockRefreshTokenService: jest.Mocked<IRefreshTokenService>;
  let mockClock: jest.Mocked<IClock>;
  let mockLogger: jest.Mocked<ILoggerPort>;

  const fixedNow = new Date('2026-07-27T12:00:00.000Z');
  const futureExpiry = new Date('2026-08-01T12:00:00.000Z');
  const pastExpiry = new Date('2026-07-20T12:00:00.000Z');

  const activeUserProps = {
    id: 'usr_123',
    email: 'test@example.com',
    passwordHash: 'hash',
    status: UserStatus.ACTIVE,
    roles: ['USER'],
    permissions: ['read:all'],
    tenantId: 'tenant_1',
    hashedRefreshToken: 'stored_hashed_token',
    refreshTokenExpiresAt: futureExpiry,
    tokenVersion: 1,
  };

  beforeEach(() => {
    mockUserRepository = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
      updateRefreshToken: jest.fn().mockResolvedValue(undefined),
    };

    mockPasswordHasher = {
      hash: jest.fn().mockResolvedValue('new_hashed_token'),
      verify: jest.fn().mockResolvedValue(true),
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
      mockPasswordHasher,
      mockAccessTokenService,
      mockRefreshTokenService,
      mockClock,
      mockLogger,
    );
  });

  it('should rotate refresh token and issue new access token successfully', async () => {
    const user = new User(activeUserProps);
    mockUserRepository.findById.mockResolvedValue(user);

    const result = await useCase.execute({ refreshToken: 'valid_refresh_token' });

    expect(mockRefreshTokenService.validateRefreshToken).toHaveBeenCalledWith(
      'valid_refresh_token',
    );
    expect(mockUserRepository.findById).toHaveBeenCalledWith('usr_123');
    expect(mockPasswordHasher.verify).toHaveBeenCalledWith(
      'valid_refresh_token',
      'stored_hashed_token',
    );
    expect(mockAccessTokenService.generateToken).toHaveBeenCalledWith({
      userId: 'usr_123',
      email: 'test@example.com',
      roles: ['USER'],
      permissions: ['read:all'],
      tokenVersion: 1,
      tenantId: 'tenant_1',
    });
    expect(mockRefreshTokenService.generateRefreshToken).toHaveBeenCalledWith({
      userId: 'usr_123',
      familyId: 'fam_123',
      tokenVersion: 1,
      tenantId: 'tenant_1',
    });
    expect(mockPasswordHasher.hash).toHaveBeenCalledWith('new_raw_refresh_token');
    expect(mockUserRepository.save).toHaveBeenCalledWith(user);

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
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  });

  it('should throw InvalidTokenException when refreshToken input is missing', async () => {
    await expect(useCase.execute({ refreshToken: '' })).rejects.toThrow(InvalidTokenException);
  });

  it('should throw InvalidTokenException when token validation fails', async () => {
    mockRefreshTokenService.validateRefreshToken.mockResolvedValue(null);

    await expect(useCase.execute({ refreshToken: 'bad_token' })).rejects.toThrow(
      InvalidTokenException,
    );
  });

  it('should throw InvalidTokenException when user does not exist', async () => {
    mockUserRepository.findById.mockResolvedValue(null);

    await expect(useCase.execute({ refreshToken: 'valid_format_token' })).rejects.toThrow(
      InvalidTokenException,
    );
  });

  it('should throw AccountDisabledException when user is not active', async () => {
    const suspendedUser = new User({ ...activeUserProps, status: UserStatus.SUSPENDED });
    mockUserRepository.findById.mockResolvedValue(suspendedUser);

    await expect(useCase.execute({ refreshToken: 'valid_format_token' })).rejects.toThrow(
      AccountDisabledException,
    );
  });

  it('should throw InvalidTokenException if user has no stored hashed refresh token', async () => {
    const revokedUser = new User({ ...activeUserProps, hashedRefreshToken: null });
    mockUserRepository.findById.mockResolvedValue(revokedUser);

    await expect(useCase.execute({ refreshToken: 'valid_format_token' })).rejects.toThrow(
      InvalidTokenException,
    );
  });

  it('should throw InvalidTokenException and clear stored token if stored refresh token has expired', async () => {
    const expiredUser = new User({ ...activeUserProps, refreshTokenExpiresAt: pastExpiry });
    mockUserRepository.findById.mockResolvedValue(expiredUser);

    await expect(useCase.execute({ refreshToken: 'valid_format_token' })).rejects.toThrow(
      InvalidTokenException,
    );
    expect(expiredUser.hashedRefreshToken).toBeNull();
    expect(mockUserRepository.save).toHaveBeenCalledWith(expiredUser);
  });

  it('should handle token mismatch / reuse attempt: clear stored token, increment version, throw InvalidTokenException', async () => {
    const user = new User(activeUserProps);
    mockUserRepository.findById.mockResolvedValue(user);
    mockPasswordHasher.verify.mockResolvedValue(false);

    await expect(useCase.execute({ refreshToken: 'reused_token' })).rejects.toThrow(
      InvalidTokenException,
    );

    expect(user.hashedRefreshToken).toBeNull();
    expect(user.tokenVersion).toBe(2);
    expect(mockUserRepository.save).toHaveBeenCalledWith(user);
    expect(mockLogger.error).toHaveBeenCalled();
  });
});
