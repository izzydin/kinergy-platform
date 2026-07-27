import { User, UserStatus, IRefreshTokenRepository } from '../../domain';
import { IUserRepository } from '../../domain/user.repository.interface';
import { IPasswordHasher } from '../../password/password-hasher.interface';
import { IAccessTokenService } from '../../tokens/access-token.service';
import { IRefreshTokenService } from '../../tokens/refresh-token.service';
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
        token: 'mock_refresh_token',
        jti: 'jti_123',
        familyId: 'fam_123',
      }),
      validateRefreshToken: jest.fn(),
      generateOpaqueToken: jest.fn().mockReturnValue('opaque_token'),
    };

    mockClock = {
      now: jest.fn().mockReturnValue(fixedDate),
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
      tokenHasher,
      mockAccessTokenService,
      mockRefreshTokenService,
      mockClock,
      mockLogger,
    );
  });

  it('should authenticate user successfully and persist hashed refresh token entity', async () => {
    mockUserRepository.findByEmail.mockResolvedValue(testUser);

    const result = await useCase.execute({
      email: 'test@example.com',
      password: 'ValidPassword123!',
    });

    expect(mockUserRepository.findByEmail).toHaveBeenCalledWith('test@example.com');
    expect(mockPasswordHasher.verify).toHaveBeenCalledWith(
      'ValidPassword123!',
      testUser.passwordHash,
    );
    expect(mockAccessTokenService.generateToken).toHaveBeenCalledWith({
      userId: 'usr_123',
      email: 'test@example.com',
      roles: ['USER'],
      permissions: ['read:profile'],
      tokenVersion: 1,
      tenantId: 'tenant_1',
    });
    expect(mockRefreshTokenRepository.save).toHaveBeenCalled();

    expect(result).toEqual({
      accessToken: 'mock_access_token',
      refreshToken: 'mock_refresh_token',
      tokenType: 'Bearer',
      expiresIn: 900,
      user: {
        id: 'usr_123',
        email: 'test@example.com',
        status: UserStatus.ACTIVE,
        roles: ['USER'],
        permissions: ['read:profile'],
        tenantId: 'tenant_1',
        createdAt: testUser.createdAt,
        updatedAt: testUser.updatedAt,
      },
    });
  });

  it('should throw InvalidCredentialsException if email or password is missing', async () => {
    await expect(useCase.execute({ email: '', password: '123' })).rejects.toThrow(
      InvalidCredentialsException,
    );
  });

  it('should throw InvalidCredentialsException if user is not found', async () => {
    mockUserRepository.findByEmail.mockResolvedValue(null);

    await expect(
      useCase.execute({ email: 'nonexistent@example.com', password: 'Password123!' }),
    ).rejects.toThrow(InvalidCredentialsException);
  });

  it('should throw AccountDisabledException if user status is not ACTIVE', async () => {
    const inactiveUser = new User({
      id: testUser.id,
      email: testUser.email,
      passwordHash: testUser.passwordHash,
      status: UserStatus.SUSPENDED,
      roles: testUser.roles,
      permissions: testUser.permissions,
      tenantId: testUser.tenantId,
      tokenVersion: testUser.tokenVersion,
    });
    mockUserRepository.findByEmail.mockResolvedValue(inactiveUser);

    await expect(
      useCase.execute({ email: 'test@example.com', password: 'Password123!' }),
    ).rejects.toThrow(AccountDisabledException);
  });
});
