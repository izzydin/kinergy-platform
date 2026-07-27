import { User, UserStatus, RefreshToken, IRefreshTokenRepository } from '../../domain';
import { IUserRepository } from '../../domain/user.repository.interface';
import { IRefreshTokenService } from '../../tokens/refresh-token.service';
import { Sha256TokenHasher } from '../../tokens/token-hasher.interface';
import { ILoggerPort } from '../../../logging/logger-port.interface';
import { LogoutUseCase } from '../logout.use-case';

describe('LogoutUseCase', () => {
  let useCase: LogoutUseCase;
  let mockUserRepository: jest.Mocked<IUserRepository>;
  let mockRefreshTokenRepository: jest.Mocked<IRefreshTokenRepository>;
  let mockRefreshTokenService: jest.Mocked<IRefreshTokenService>;
  let tokenHasher: Sha256TokenHasher;
  let mockLogger: jest.Mocked<ILoggerPort>;

  const testUser = new User({
    id: 'usr_123',
    email: 'test@example.com',
    passwordHash: 'hash',
    status: UserStatus.ACTIVE,
    roles: ['USER'],
    permissions: [],
  });

  const testTokenEntity = new RefreshToken({
    id: 'rt_1',
    tokenHash: 'hashed_token',
    familyId: 'fam_123',
    userId: 'usr_123',
    expiresAt: new Date(Date.now() + 100000),
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

    mockRefreshTokenService = {
      generateRefreshToken: jest.fn(),
      validateRefreshToken: jest.fn(),
      generateOpaqueToken: jest.fn(),
    };

    tokenHasher = new Sha256TokenHasher();

    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    useCase = new LogoutUseCase(
      mockUserRepository,
      mockRefreshTokenRepository,
      mockRefreshTokenService,
      tokenHasher,
      mockLogger,
    );
  });

  it('should revoke all user sessions when userId is provided', async () => {
    mockUserRepository.findById.mockResolvedValue(testUser);

    const result = await useCase.execute({ userId: 'usr_123' });

    expect(result).toEqual({ success: true });
    expect(mockRefreshTokenRepository.revokeAllForUser).toHaveBeenCalledWith('usr_123');
  });

  it('should revoke token family when valid refreshToken is provided', async () => {
    const rawToken = 'raw_refresh_token_xyz';
    const hash = tokenHasher.hashToken(rawToken);

    mockRefreshTokenRepository.findByHash.mockImplementation(async (searchHash) => {
      if (searchHash === hash) return testTokenEntity;
      return null;
    });

    const result = await useCase.execute({ refreshToken: rawToken });

    expect(result).toEqual({ success: true });
    expect(mockRefreshTokenRepository.findByHash).toHaveBeenCalledWith(hash);
    expect(mockRefreshTokenRepository.revokeFamily).toHaveBeenCalledWith('fam_123');
  });
});
