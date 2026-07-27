import { IUserRepository, User, UserStatus } from '../../../domain';
import { UpdateUserUseCase } from '../update-user.use-case';

describe('UpdateUserUseCase', () => {
  let useCase: UpdateUserUseCase;
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

    useCase = new UpdateUserUseCase(mockUserRepository);
  });

  it('should successfully update user email and role', async () => {
    const existingUser = new User({
      id: 'usr_1',
      email: 'old@example.com',
      passwordHash: 'hash',
      status: UserStatus.ACTIVE,
      roles: ['USER'],
      permissions: [],
    });

    mockUserRepository.findById.mockResolvedValue(existingUser);
    mockUserRepository.findByEmail.mockResolvedValue(null);

    const result = await useCase.execute({
      userId: 'usr_1',
      email: 'new@example.com',
      role: 'ADMIN',
    });

    expect(result.email).toBe('new@example.com');
    expect(result.roles).toContain('ADMIN');
    expect(mockUserRepository.save).toHaveBeenCalled();
  });

  it('should throw AuthException if user is not found or soft-deleted', async () => {
    mockUserRepository.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({
        userId: 'non_existent',
        email: 'test@example.com',
      }),
    ).rejects.toThrow('User not found or has been soft-deleted.');
  });

  it('should throw AuthException if updating to an existing email', async () => {
    const userToUpdate = new User({
      id: 'usr_1',
      email: 'user1@example.com',
      passwordHash: 'hash',
      status: UserStatus.ACTIVE,
      roles: ['USER'],
      permissions: [],
    });

    const otherUser = new User({
      id: 'usr_2',
      email: 'other@example.com',
      passwordHash: 'hash',
      status: UserStatus.ACTIVE,
      roles: ['USER'],
      permissions: [],
    });

    mockUserRepository.findById.mockResolvedValue(userToUpdate);
    mockUserRepository.findByEmail.mockResolvedValue(otherUser);

    await expect(
      useCase.execute({
        userId: 'usr_1',
        email: 'other@example.com',
      }),
    ).rejects.toThrow('User with this email address already exists.');
  });
});
