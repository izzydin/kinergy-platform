import { IUserRepository, User, UserStatus } from '../../../domain';
import { DeleteUserUseCase } from '../delete-user.use-case';

describe('DeleteUserUseCase', () => {
  let useCase: DeleteUserUseCase;
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

    useCase = new DeleteUserUseCase(mockUserRepository);
  });

  it('should successfully soft-delete an active user', async () => {
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
    expect(result.deletedAt).toBeDefined();
    expect(mockUserRepository.save).toHaveBeenCalled();
  });

  it('should throw AuthException when trying to soft delete an already deleted user', async () => {
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

    await expect(useCase.execute({ userId: 'usr_deleted' })).rejects.toThrow(
      'User is already soft-deleted.',
    );
  });
});
