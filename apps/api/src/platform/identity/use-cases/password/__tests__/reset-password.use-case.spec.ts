import { ISecurityEventPublisher } from '../../../events';
import {
  IPasswordHasher,
  PasswordPolicyService,
  TemporaryPasswordGeneratorService,
} from '../../../password';
import { IUserRepository, User, UserStatus } from '../../../domain';
import { ResetPasswordUseCase } from '../reset-password.use-case';

describe('ResetPasswordUseCase', () => {
  let useCase: ResetPasswordUseCase;
  let mockUserRepository: jest.Mocked<IUserRepository>;
  let mockPasswordHasher: jest.Mocked<IPasswordHasher>;
  let tempPassGenerator: TemporaryPasswordGeneratorService;
  let mockSecurityEventPublisher: jest.Mocked<ISecurityEventPublisher>;

  beforeEach(() => {
    mockUserRepository = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
      search: jest.fn(),
      updateRefreshToken: jest.fn(),
    };

    mockPasswordHasher = {
      hash: jest.fn().mockResolvedValue('temp_password_hash_789'),
      verify: jest.fn(),
    };

    tempPassGenerator = new TemporaryPasswordGeneratorService(new PasswordPolicyService());

    mockSecurityEventPublisher = {
      publish: jest.fn().mockResolvedValue(undefined),
    };

    useCase = new ResetPasswordUseCase(
      mockUserRepository,
      mockPasswordHasher,
      tempPassGenerator,
      mockSecurityEventPublisher,
    );
  });

  it('should successfully generate temporary password, invalidate refresh tokens, and publish PasswordResetByAdmin event', async () => {
    const user = new User({
      id: 'usr_target',
      email: 'target@example.com',
      passwordHash: 'old_hash',
      status: UserStatus.ACTIVE,
      roles: ['USER'],
      permissions: [],
      hashedRefreshToken: 'active_refresh_token',
      tokenVersion: 1,
    });

    mockUserRepository.findById.mockResolvedValue(user);

    const result = await useCase.execute({
      userId: 'usr_target',
      adminId: 'usr_admin',
    });

    expect(result.userId).toBe('usr_target');
    expect(result.temporaryPassword).toBeDefined();
    expect(result.temporaryPassword.length).toBeGreaterThanOrEqual(12);

    expect(user.passwordHash).toBe('temp_password_hash_789');
    expect(user.hashedRefreshToken).toBeNull();
    expect(user.tokenVersion).toBe(2);

    expect(mockUserRepository.save).toHaveBeenCalledWith(user);
    expect(mockSecurityEventPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'PasswordResetByAdmin',
        userId: 'usr_target',
      }),
    );
  });

  it('should throw AuthException when attempting to reset password for non-existent user', async () => {
    mockUserRepository.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({
        userId: 'non_existent',
      }),
    ).rejects.toThrow('User not found or has been soft-deleted.');
  });
});
