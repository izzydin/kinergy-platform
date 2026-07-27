import { User, UserStatus, IRefreshTokenRepository } from '../../domain';
import { IUserRepository } from '../../domain/user.repository.interface';
import { ISecurityEventPublisher } from '../../events/security-event-publisher.interface';
import { IPasswordHasher } from '../../password/password-hasher.interface';
import { IAccessTokenService } from '../../tokens/access-token.service';
import { IRefreshTokenService } from '../../tokens/refresh-token.service';
import { ITokenConfiguration } from '../../tokens/token-configuration.interface';
import { Sha256TokenHasher } from '../../tokens/token-hasher.interface';
import { IClock } from '../../../../shared/common/clock.interface';
import { ILoggerPort } from '../../../logging/logger-port.interface';
import { LoginUseCase } from '../login.use-case';
import {
  AccountDisabledException,
  InvalidCredentialsException,
} from '../exceptions/auth.exception';

describe('LoginUseCase', () => {
  let useCase: LoginUseCase;
  let mockUserRepository: jest.Mocked<IUserRepository>;
  let mockRefreshTokenRepository: jest.Mocked<IRefreshTokenRepository>;
  let mockPasswordHasher: jest.Mocked<IPasswordHasher>;
  let tokenHasher: Sha256TokenHasher;
  let mockAccessTokenService: jest.Mocked<IAccessTokenService>;
  let mockRefreshTokenService: jest.Mocked<IRefreshTokenService>;
  let mockClock: jest.Mocked<IClock>;
  let mockTokenConfiguration: jest.Mocked<ITokenConfiguration>;
  let mockSecurityEventPublisher: jest.Mocked<ISecurityEventPublisher>;
  let mockLogger: jest.Mocked<ILoggerPort>;

  const fixedDate = new Date('2026-07-27T12:00:00.000Z');

  const testUser = new User({
    id: 'usr_123',
    email: 'test@example.com',
    passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$hashedpassword',
    status: UserStatus.ACTIVE,
    roles: ['USER'],
    permissions: ['read:profile'],
    tenantId: 'tenant_1',
    tokenVersion: 1,
  });

  beforeEach(() => {
    mockUserRepository = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
      updateRefreshToken: jest.fn().mockResolvedValue(undefined),
    };

    mockRefreshTokenRepository = {
      save: jest.fn().mockResolvedValue(undefined),
      findByHash: jest.fn(),
      findByFamilyId: jest.fn(),
      findByUserId: jest.fn(),
      revokeFamily: jest.fn().mockResolvedValue(undefined),
      revokeAllForUser: jest.fn().mockResolvedValue(undefined),
      deleteExpired: jest.fn().mockResolvedValue(0),
    };

    mockPasswordHasher = {
      hash: jest.fn().mockResolvedValue('hashed_password'),
      verify: jest.fn().mockResolvedValue(true),
    };

    tokenHasher = new Sha256TokenHasher();

    mockAccessTokenService = {
      generateToken: jest.fn().mockResolvedValue('mock_access_token'),
      validateToken: jest.fn(),
    };

    mockRefreshTokenService = {
      generateRefreshToken: jest.fn().mockResolvedValue({
        token: 'mock_raw_refresh_token',
        familyId: 'fam_123',
      }),
      validateRefreshToken: jest.fn(),
      generateOpaqueToken: jest.fn().mockReturnValue('opaque_token'),
    };

    mockClock = {
      now: jest.fn().mockReturnValue(fixedDate),
    };

    mockTokenConfiguration = {
      getAccessTokenTtlSeconds: jest.fn().mockReturnValue(900),
      getAccessTokenTtlMs: jest.fn().mockReturnValue(900000),
      getRefreshTokenTtlSeconds: jest.fn().mockReturnValue(604800),
      getRefreshTokenTtlMs: jest.fn().mockReturnValue(604800000),
      getAccessTokenExpiresInString: jest.fn().mockReturnValue('15m'),
      getRefreshTokenExpiresInString: jest.fn().mockReturnValue('7d'),
      getIssuer: jest.fn().mockReturnValue('kinergy-platform'),
      getAudience: jest.fn().mockReturnValue('kinergy-api'),
      getClockSkewSeconds: jest.fn().mockReturnValue(60),
      getTokenPolicy: jest.fn(),
    };

    mockSecurityEventPublisher = {
      publish: jest.fn().mockResolvedValue(undefined),
    };

    mockLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    useCase = new LoginUseCase(
      mockUserRepository,
      mockRefreshTokenRepository,
      mockPasswordHasher,
      tokenHasher,
      mockAccessTokenService,
      mockRefreshTokenService,
      mockClock,
      mockTokenConfiguration,
      mockSecurityEventPublisher,
      mockLogger,
    );
  });

  it('should authenticate user successfully and publish LoginSucceeded security event', async () => {
    mockUserRepository.findByEmail.mockResolvedValue(testUser);

    const result = await useCase.execute({
      email: 'test@example.com',
      password: 'CorrectPassword123!',
    });

    expect(result.accessToken).toBe('mock_access_token');
    expect(result.refreshToken).toBe('mock_raw_refresh_token');
    expect(result.tokenType).toBe('Bearer');
    expect(result.expiresIn).toBe(900);
    expect(result.user.id).toBe(testUser.id);

    expect(mockSecurityEventPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'LoginSucceeded',
        userId: testUser.id,
        email: testUser.email,
      }),
    );
  });

  it('should publish LoginFailed event and throw InvalidCredentialsException if user is not found', async () => {
    mockUserRepository.findByEmail.mockResolvedValue(null);

    await expect(
      useCase.execute({ email: 'nonexistent@example.com', password: 'password' }),
    ).rejects.toThrow(InvalidCredentialsException);

    expect(mockSecurityEventPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'LoginFailed',
        email: 'nonexistent@example.com',
        reason: 'User not found',
      }),
    );
  });

  it('should publish LoginFailed event and throw AccountDisabledException if user status is suspended', async () => {
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
    ).rejects.toThrow(AccountDisabledException);

    expect(mockSecurityEventPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'LoginFailed',
        userId: 'usr_disabled',
        email: 'disabled@example.com',
      }),
    );
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
        userId: testUser.id,
        email: testUser.email,
        reason: 'Invalid password',
      }),
    );
  });
});
