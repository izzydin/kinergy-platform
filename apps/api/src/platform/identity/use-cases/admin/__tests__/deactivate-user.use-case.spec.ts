import { IUserRepository, User, UserStatus } from '../../../domain';
import { AuthException } from '../../exceptions/auth.exception';
import { DeactivateUserUseCase } from '../deactivate-user.use-case';

describe('DeactivateUserUseCase', () => {
  let useCase: DeactivateUserUseCase;
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

    useCase = new DeactivateUserUseCase(mockUserRepository);
  });

  it('should successfully deactivate an active user', async () => {
    const user = new User({
      id: 'usr_1',
      email: 'user@example.com',
      passwordHash: 'hash',
      status: UserStatus.ACTIVE,
      roles: ['USER'],
      permissions: [],
    });

    mockUserRepository.findById.mockResolvedValue(user);

    const result = await useCase.execute({ userId: 'usr_1' });

    expect(result.status).toBe(UserStatus.DEACTIVATED);
    expect(mockUserRepository.save).toHaveBeenCalled();
  });

  it('should throw AuthException when trying to deactivate a soft-deleted user', async () => {
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
