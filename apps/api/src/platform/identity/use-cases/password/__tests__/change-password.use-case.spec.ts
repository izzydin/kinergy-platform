import { ISecurityEventPublisher } from '../../../events';
import { IPasswordHasher, PasswordPolicyService } from '../../../password';
import { IUserRepository, User, UserStatus } from '../../../domain';
import { AuthException } from '../../exceptions/auth.exception';
import { ChangePasswordUseCase } from '../change-password.use-case';

describe('ChangePasswordUseCase', () => {
  let useCase: ChangePasswordUseCase;
  let mockUserRepository: jest.Mocked<IUserRepository>;
  let mockPasswordHasher: jest.Mocked<IPasswordHasher>;
  let policyService: PasswordPolicyService;
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
      hash: jest.fn().mockResolvedValue('new_hash_456'),
      verify: jest.fn(),
    };

    policyService = new PasswordPolicyService();

    mockSecurityEventPublisher = {
      publish: jest.fn().mockResolvedValue(undefined),
    };

    useCase = new ChangePasswordUseCase(
      mockUserRepository,
      mockPasswordHasher,
      policyService,
      mockSecurityEventPublisher,
    );
  });

  it('should successfully change password, invalidate tokens, and publish security event', async () => {
    const user = new User({
      id: 'usr_1',
      email: 'user@example.com',
      passwordHash: 'old_hash_123',
      status: UserStatus.ACTIVE,
      roles: ['USER'],
      permissions: [],
      hashedRefreshToken: 'active_refresh_token',
      tokenVersion: 1,
    });

    mockUserRepository.findById.mockResolvedValue(user);
    mockPasswordHasher.verify.mockResolvedValue(true);

    const result = await useCase.execute({
      userId: 'usr_1',
      currentPassword: 'OldPassword123!',
      newPassword: 'NewSecurePassword456!',
    });

    expect(result.success).toBe(true);
    expect(user.passwordHash).toBe('new_hash_456');
    expect(user.hashedRefreshToken).toBeNull();
    expect(user.tokenVersion).toBe(2);
    expect(mockUserRepository.save).toHaveBeenCalledWith(user);
    expect(mockSecurityEventPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'PasswordChanged',
        userId: 'usr_1',
      }),
    );
  });

  it('should throw AuthException on invalid current password', async () => {
    const user = new User({
      id: 'usr_1',
      email: 'user@example.com',
      passwordHash: 'old_hash_123',
      status: UserStatus.ACTIVE,
      roles: ['USER'],
      permissions: [],
    });

    mockUserRepository.findById.mockResolvedValue(user);
    mockPasswordHasher.verify.mockResolvedValue(false);

    await expect(
      useCase.execute({
        userId: 'usr_1',
        currentPassword: 'WrongPassword123!',
        newPassword: 'NewSecurePassword456!',
      }),
    ).rejects.toThrow('Invalid current password.');
  });

  it('should throw AuthException if new password is identical to current password', async () => {
    const user = new User({
      id: 'usr_1',
      email: 'user@example.com',
      passwordHash: 'old_hash_123',
      status: UserStatus.ACTIVE,
      roles: ['USER'],
      permissions: [],
    });

    mockUserRepository.findById.mockResolvedValue(user);
    mockPasswordHasher.verify.mockResolvedValue(true);

    await expect(
      useCase.execute({
        userId: 'usr_1',
        currentPassword: 'SamePassword123!',
        newPassword: 'SamePassword123!',
      }),
    ).rejects.toThrow('New password must differ from current password.');
  });

  it('should throw AuthException if new password fails password complexity policy', async () => {
    const user = new User({
      id: 'usr_1',
      email: 'user@example.com',
      passwordHash: 'old_hash_123',
      status: UserStatus.ACTIVE,
      roles: ['USER'],
      permissions: [],
    });

    mockUserRepository.findById.mockResolvedValue(user);
    mockPasswordHasher.verify.mockResolvedValue(true);

    await expect(
      useCase.execute({
        userId: 'usr_1',
        currentPassword: 'OldPassword123!',
        newPassword: 'weak',
      }),
    ).rejects.toThrow(AuthException);
  });
});
