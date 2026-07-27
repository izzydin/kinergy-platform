import { User, UserStatus } from '../../domain';
import { IUserRepository } from '../../domain/user.repository.interface';
import { IRefreshTokenService } from '../../tokens/refresh-token.service';
import { ILoggerPort } from '../../../logging/logger-port.interface';
import { LogoutUseCase } from '../logout.use-case';

describe('LogoutUseCase', () => {
  let useCase: LogoutUseCase;
  let mockUserRepository: jest.Mocked<IUserRepository>;
  let mockRefreshTokenService: jest.Mocked<IRefreshTokenService>;
  let mockLogger: jest.Mocked<ILoggerPort>;

  const testUser = new User({
    id: 'usr_123',
    email: 'test@example.com',
    passwordHash: 'hash',
    status: UserStatus.ACTIVE,
    roles: ['USER'],
    permissions: [],
    hashedRefreshToken: 'hashed_token',
    refreshTokenExpiresAt: new Date(),
  });

  beforeEach(() => {
    mockUserRepository = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
      updateRefreshToken: jest.fn().mockResolvedValue(undefined),
    };

    mockRefreshTokenService = {
      generateRefreshToken: jest.fn(),
      validateRefreshToken: jest.fn(),
      generateOpaqueToken: jest.fn(),
    };

    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    useCase = new LogoutUseCase(mockUserRepository, mockRefreshTokenService, mockLogger);
  });

  it('should logout user by userId and clear refresh token', async () => {
    mockUserRepository.findById.mockResolvedValue(testUser);

    const result = await useCase.execute({ userId: 'usr_123' });

    expect(result).toEqual({ success: true });
    expect(mockUserRepository.findById).toHaveBeenCalledWith('usr_123');
    expect(testUser.hashedRefreshToken).toBeNull();
    expect(testUser.refreshTokenExpiresAt).toBeNull();
    expect(mockUserRepository.save).toHaveBeenCalledWith(testUser);
  });

  it('should logout user by validating refresh token when userId is not provided', async () => {
    mockRefreshTokenService.validateRefreshToken.mockResolvedValue({
      sub: 'usr_123',
      familyId: 'fam_1',
      jti: 'jti_1',
      tokenVersion: 1,
      tenantId: null,
      sessionId: null,
      iat: 100,
      exp: 200,
    });
    mockUserRepository.findById.mockResolvedValue(testUser);

    const result = await useCase.execute({ refreshToken: 'valid_refresh_token' });

    expect(result).toEqual({ success: true });
    expect(mockRefreshTokenService.validateRefreshToken).toHaveBeenCalledWith(
      'valid_refresh_token',
    );
    expect(mockUserRepository.findById).toHaveBeenCalledWith('usr_123');
    expect(mockUserRepository.save).toHaveBeenCalled();
  });

  it('should handle non-existent user or null input gracefully', async () => {
    mockUserRepository.findById.mockResolvedValue(null);

    const result = await useCase.execute({ userId: 'nonexistent' });

    expect(result).toEqual({ success: true });
    expect(mockUserRepository.save).not.toHaveBeenCalled();
  });
});
