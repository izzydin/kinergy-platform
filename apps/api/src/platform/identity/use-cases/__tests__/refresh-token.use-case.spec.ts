import { User, UserStatus, RefreshToken, IRefreshTokenRepository } from '../../domain';
import { IUserRepository } from '../../domain/user.repository.interface';
import { IAccessTokenService } from '../../tokens/access-token.service';
import { IRefreshTokenService } from '../../tokens/refresh-token.service';
import { Sha256TokenHasher } from '../../tokens/token-hasher.interface';
import { IClock } from '../../../../shared/common/clock.interface';
import { ILoggerPort } from '../../../logging/logger-port.interface';
import { IUnitOfWork } from '../../../persistence/unit-of-work.interface';
import { RefreshTokenUseCase } from '../refresh-token.use-case';
import { AccountDisabledException, InvalidTokenException } from '../exceptions/auth.exception';

describe('RefreshTokenUseCase', () => {
  let useCase: RefreshTokenUseCase;
  let mockUserRepository: jest.Mocked<IUserRepository>;
  let mockRefreshTokenRepository: jest.Mocked<IRefreshTokenRepository>;
  let tokenHasher: Sha256TokenHasher;
  let mockAccessTokenService: jest.Mocked<IAccessTokenService>;
  let mockRefreshTokenService: jest.Mocked<IRefreshTokenService>;
  let mockClock: jest.Mocked<IClock>;
  let mockUnitOfWork: IUnitOfWork;
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
      findByFamilyId: jest.fn().mockResolvedValue([]),
      findByUserId: jest.fn().mockResolvedValue([]),
      revokeFamily: jest.fn().mockResolvedValue(undefined),
      revokeAllForUser: jest.fn().mockResolvedValue(undefined),
      deleteExpired: jest.fn().mockResolvedValue(0),
    };

    mockAccessTokenService = {
      generateToken: jest.fn().mockResolvedValue('new_access_token'),
      validateToken: jest.fn().mockResolvedValue(null),
    };

    mockRefreshTokenService = {
      generateRefreshToken: jest.fn().mockResolvedValue({
        token: 'new_raw_refresh_token',
        familyId: 'fam_123',
      }),
      validateRefreshToken: jest.fn().mockResolvedValue({
        sub: 'usr_123',
        familyId: 'fam_123',
        tokenVersion: 1,
        tenantId: 'tenant_1',
      }),
      generateOpaqueToken: jest.fn().mockReturnValue('opaque_token'),
    };

    mockClock = {
      now: jest.fn().mockReturnValue(fixedNow),
    };

    mockUnitOfWork = {
      executeInTransaction: jest.fn().mockImplementation((work: () => Promise<unknown>) => work()),
    };

    mockLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    useCase = new RefreshTokenUseCase(
      mockUserRepository,
      mockRefreshTokenRepository,
      tokenHasher,
      mockAccessTokenService,
      mockRefreshTokenService,
      mockClock,
      mockUnitOfWork,
      mockLogger,
    );
  });

  it('should successfully rotate refresh token inside an IUnitOfWork transaction', async () => {
    const result = await useCase.execute({ refreshToken: rawToken });

    expect(mockUnitOfWork.executeInTransaction).toHaveBeenCalledTimes(1);
    expect(result.accessToken).toBe('new_access_token');
    expect(result.refreshToken).toBe('new_raw_refresh_token');
    expect(mockRefreshTokenRepository.save).toHaveBeenCalledTimes(2);
  });

  it('should trigger replay attack protection and revoke token family on reused token within transaction', async () => {
    const tokenHash = tokenHasher.hashToken(rawToken);
    mockRefreshTokenRepository.findByHash.mockResolvedValueOnce(
      new RefreshToken({
        id: 'rt_revoked',
        tokenHash,
        familyId: 'fam_123',
        userId: 'usr_123',
        isRevoked: true,
        expiresAt: futureExpiry,
      }),
    );

    await expect(useCase.execute({ refreshToken: rawToken })).rejects.toThrow(
      InvalidTokenException,
    );
    expect(mockUnitOfWork.executeInTransaction).toHaveBeenCalledTimes(1);
    expect(mockRefreshTokenRepository.revokeFamily).toHaveBeenCalledWith('fam_123');
  });

  it('should reject expired refresh token within transaction', async () => {
    const tokenHash = tokenHasher.hashToken(rawToken);
    mockRefreshTokenRepository.findByHash.mockResolvedValueOnce(
      new RefreshToken({
        id: 'rt_expired',
        tokenHash,
        familyId: 'fam_123',
        userId: 'usr_123',
        isRevoked: false,
        expiresAt: pastExpiry,
      }),
    );

    await expect(useCase.execute({ refreshToken: rawToken })).rejects.toThrow(
      InvalidTokenException,
    );
    expect(mockUnitOfWork.executeInTransaction).toHaveBeenCalledTimes(1);
  });

  it('should reject if user account is disabled within transaction', async () => {
    const disabledUser = new User({
      id: 'usr_123',
      email: 'test@example.com',
      passwordHash: 'hash',
      status: UserStatus.SUSPENDED,
      roles: ['USER'],
      permissions: [],
      tokenVersion: 1,
    });
    mockUserRepository.findById.mockResolvedValueOnce(disabledUser);

    await expect(useCase.execute({ refreshToken: rawToken })).rejects.toThrow(
      AccountDisabledException,
    );
    expect(mockUnitOfWork.executeInTransaction).toHaveBeenCalledTimes(1);
    expect(mockRefreshTokenRepository.revokeFamily).toHaveBeenCalledWith('fam_123');
  });

  it('should propagate errors thrown inside transaction callback for automatic rollback', async () => {
    mockRefreshTokenRepository.save.mockRejectedValueOnce(new Error('Database Connection Error'));

    await expect(useCase.execute({ refreshToken: rawToken })).rejects.toThrow(
      'Database Connection Error',
    );
    expect(mockUnitOfWork.executeInTransaction).toHaveBeenCalledTimes(1);
  });
});
