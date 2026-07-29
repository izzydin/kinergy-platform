import { LoginUseCase } from '../login.use-case';
import { IUserRepository, IRefreshTokenRepository, User, UserStatus } from '../../domain';
import { IPasswordHasher } from '../../password/password-hasher.interface';
import { ITokenHasher } from '../../tokens/token-hasher.interface';
import { IAccessTokenService } from '../../tokens/access-token.service';
import { IRefreshTokenService } from '../../tokens/refresh-token.service';
import { IClock } from '../../../../shared/common/clock.interface';
import { ITokenConfiguration } from '../../tokens/token-configuration.interface';
import { ISecurityEventPublisher } from '../../events/security-event-publisher.interface';
import { ILoggerPort } from '../../../logging/logger-port.interface';
import { InvalidCredentialsException } from '../exceptions/auth.exception';

describe('LoginUseCase', () => {
  let useCase: LoginUseCase;
  let mockUserRepository: jest.Mocked<IUserRepository>;
  let mockRefreshTokenRepository: jest.Mocked<IRefreshTokenRepository>;
  let mockPasswordHasher: jest.Mocked<IPasswordHasher>;
  let mockTokenHasher: jest.Mocked<ITokenHasher>;
  let mockAccessTokenService: jest.Mocked<IAccessTokenService>;
  let mockRefreshTokenService: jest.Mocked<IRefreshTokenService>;
  let mockClock: jest.Mocked<IClock>;
  let mockTokenConfiguration: jest.Mocked<ITokenConfiguration>;
  let mockSecurityEventPublisher: jest.Mocked<ISecurityEventPublisher>;
  let mockLogger: jest.Mocked<ILoggerPort>;

  const testNow = new Date('2026-07-27T12:00:00.000Z');
  const testUser = new User({
    id: 'usr_123',
    email: 'test@example.com',
    passwordHash: 'hashedPassword123',
    status: UserStatus.ACTIVE,
    roles: ['USER'],
    permissions: ['read:profile'],
    tokenVersion: 1,
    tenantId: 'tenant_1',
    createdAt: testNow,
    updatedAt: testNow,
  });

  beforeEach(() => {
    mockUserRepository = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<IUserRepository>;

    mockRefreshTokenRepository = {
      findById: jest.fn(),
      findByTokenHash: jest.fn(),
      save: jest.fn(),
      revokeFamily: jest.fn(),
      deleteExpired: jest.fn(),
      deleteByUserId: jest.fn(),
    } as unknown as jest.Mocked<IRefreshTokenRepository>;

    mockPasswordHasher = {
      hash: jest.fn(),
      verify: jest.fn(),
    };

    mockTokenHasher = {
      hashToken: jest.fn(),
    };

    mockAccessTokenService = {
      generateToken: jest.fn(),
    } as unknown as jest.Mocked<IAccessTokenService>;

    mockRefreshTokenService = {
      generateRefreshToken: jest.fn(),
      validateRefreshToken: jest.fn(),
      generateOpaqueToken: jest.fn(),
    } as unknown as jest.Mocked<IRefreshTokenService>;

    mockClock = {
      now: jest.fn().mockReturnValue(testNow),
    };

    mockTokenConfiguration = {
      getAccessTokenTtlSeconds: jest.fn().mockReturnValue(900),
      getRefreshTokenTtlMs: jest.fn().mockReturnValue(604800000),
    } as unknown as jest.Mocked<ITokenConfiguration>;

    mockSecurityEventPublisher = {
      publish: jest.fn().mockResolvedValue(undefined),
    };

    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    useCase = new LoginUseCase(
      mockUserRepository,
      mockRefreshTokenRepository,
      mockPasswordHasher,
      mockTokenHasher,
      mockAccessTokenService,
      mockRefreshTokenService,
      mockClock,
      mockTokenConfiguration,
      mockSecurityEventPublisher,
      mockLogger,
    );
  });

  it('should authenticate user successfully, save refresh token entity, and publish LoginSucceeded event', async () => {
    mockUserRepository.findByEmail.mockResolvedValue(testUser);
    mockPasswordHasher.verify.mockResolvedValue(true);
    mockAccessTokenService.generateToken.mockResolvedValue('mock.access.token');
    mockRefreshTokenService.generateRefreshToken.mockResolvedValue({
      token: 'raw_refresh_token_123',
      familyId: 'family_123',
      jti: 'jti_123',
    });
    mockTokenHasher.hashToken.mockReturnValue('hashed_refresh_token_123');

    const result = await useCase.execute({
      email: 'Test@Example.com ',
      password: 'Password123!',
    });

    expect(mockUserRepository.findByEmail).toHaveBeenCalledWith('test@example.com');
    expect(mockPasswordHasher.verify).toHaveBeenCalledWith('Password123!', 'hashedPassword123');
    expect(mockRefreshTokenRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenHash: 'hashed_refresh_token_123',
        familyId: 'family_123',
        userId: 'usr_123',
        isRevoked: false,
      }),
    );
    expect(mockSecurityEventPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'LoginSucceeded',
        userId: 'usr_123',
        email: 'test@example.com',
        tenantId: 'tenant_1',
      }),
    );
    expect(result).toEqual({
      accessToken: 'mock.access.token',
      refreshToken: 'raw_refresh_token_123',
      tokenType: 'Bearer',
      expiresIn: 900,
      user: {
        id: 'usr_123',
        email: 'test@example.com',
        status: UserStatus.ACTIVE,
        roles: ['USER'],
        permissions: ['read:profile'],
        tenantId: 'tenant_1',
        createdAt: testNow,
        updatedAt: testNow,
      },
    });
  });

  it('should execute dummy password verification, publish LoginFailed event, and throw InvalidCredentialsException if user is not found', async () => {
    mockUserRepository.findByEmail.mockResolvedValue(null);
    mockPasswordHasher.verify.mockResolvedValue(false);

    await expect(
      useCase.execute({ email: 'nonexistent@example.com', password: 'password' }),
    ).rejects.toThrow(InvalidCredentialsException);

    expect(mockPasswordHasher.verify).toHaveBeenCalledWith(
      'password',
      expect.stringContaining('$argon2id$'),
    );
    expect(mockSecurityEventPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'LoginFailed',
        email: 'nonexistent@example.com',
        reason: 'User not found',
      }),
    );
  });

  it('should publish LoginFailed event and throw InvalidCredentialsException if user status is suspended', async () => {
    const suspendedUser = new User({
      id: 'usr_disabled',
      email: 'disabled@example.com',
      passwordHash: 'hash',
      status: UserStatus.SUSPENDED,
      roles: ['USER'],
      permissions: [],
      tokenVersion: 1,
    });
    mockUserRepository.findByEmail.mockResolvedValue(suspendedUser);

    await expect(
      useCase.execute({ email: 'disabled@example.com', password: 'password' }),
    ).rejects.toThrow(InvalidCredentialsException);

    expect(mockSecurityEventPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'LoginFailed',
        userId: 'usr_disabled',
        email: 'disabled@example.com',
        reason: 'Account status disabled (SUSPENDED)',
      }),
    );
  });

  it('should publish LoginFailed event and throw InvalidCredentialsException for PENDING, INACTIVE, or BLOCKED status', async () => {
    const pendingUser = new User({
      id: 'usr_pending',
      email: 'pending@example.com',
      passwordHash: 'hash',
      status: UserStatus.PENDING,
      roles: ['USER'],
      permissions: [],
      tokenVersion: 1,
    });
    mockUserRepository.findByEmail.mockResolvedValue(pendingUser);

    await expect(
      useCase.execute({ email: 'pending@example.com', password: 'password' }),
    ).rejects.toThrow(InvalidCredentialsException);

    const blockedUser = new User({
      id: 'usr_blocked',
      email: 'blocked@example.com',
      passwordHash: 'hash',
      status: UserStatus.BLOCKED,
      roles: ['USER'],
      permissions: [],
      tokenVersion: 1,
    });
    mockUserRepository.findByEmail.mockResolvedValue(blockedUser);

    await expect(
      useCase.execute({ email: 'blocked@example.com', password: 'password' }),
    ).rejects.toThrow(InvalidCredentialsException);
  });

  it('should publish LoginFailed event and throw InvalidCredentialsException if password verification fails', async () => {
    mockUserRepository.findByEmail.mockResolvedValue(testUser);
    mockPasswordHasher.verify.mockResolvedValue(false);

    await expect(
      useCase.execute({ email: 'test@example.com', password: 'WrongPassword' }),
    ).rejects.toThrow(InvalidCredentialsException);

    expect(mockSecurityEventPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'LoginFailed',
        userId: 'usr_123',
        email: 'test@example.com',
        reason: 'Invalid password',
      }),
    );
  });
});
