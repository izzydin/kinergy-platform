import { IUserRepository, User, UserStatus } from '../../../domain';
import { AuthException } from '../../exceptions/auth.exception';
import { ActivateUserUseCase } from '../activate-user.use-case';

describe('ActivateUserUseCase', () => {
  let useCase: ActivateUserUseCase;
  let mockUserRepository: jest.Mocked<IUserRepository>;

  beforeEach(() => {
    mockUserRepository = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
      search: jest.fn(),
      updateRefreshToken: jest.fn(),
    };

    useCase = new ActivateUserUseCase(mockUserRepository);
  });

  it('should successfully activate a deactivated or pending user', async () => {
    const user = new User({
      id: 'usr_1',
      email: 'user@example.com',
      passwordHash: 'hash',
      status: UserStatus.DEACTIVATED,
      roles: ['USER'],
      permissions: [],
    });

    mockUserRepository.findById.mockResolvedValue(user);

    const result = await useCase.execute({ userId: 'usr_1' });

    expect(result.status).toBe(UserStatus.ACTIVE);
    expect(mockUserRepository.save).toHaveBeenCalled();
  });

  it('should throw AuthException when trying to activate a soft-deleted user', async () => {
    const deletedUser = new User({
      id: 'usr_deleted',
      email: 'deleted@example.com',
      passwordHash: 'hash',
      status: UserStatus.DEACTIVATED,
      roles: ['USER'],
      permissions: [],
      deletedAt: new Date(),
    });

    mockUserRepository.findById.mockResolvedValue(deletedUser);

    await expect(useCase.execute({ userId: 'usr_deleted' })).rejects.toThrow(AuthException);
  });
});
