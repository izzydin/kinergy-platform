import { IUserRepository, User, UserStatus } from '../../../domain';
import { SearchUsersUseCase } from '../search-users.use-case';

describe('SearchUsersUseCase', () => {
  let useCase: SearchUsersUseCase;
  let mockUserRepository: jest.Mocked<IUserRepository>;

  beforeEach(() => {
    mockUserRepository = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      search: jest.fn(),
      updateRefreshToken: jest.fn(),
    };

    useCase = new SearchUsersUseCase(mockUserRepository);
  });

  it('should search users with pagination and filtering parameters', async () => {
    const mockUsers = [
      new User({
        id: 'usr_1',
        email: 'user1@example.com',
        passwordHash: 'hash',
        status: UserStatus.ACTIVE,
        roles: ['ADMIN'],
        permissions: [],
      }),
    ];

    mockUserRepository.search.mockResolvedValue({
      items: mockUsers,
      total: 1,
      page: 1,
      limit: 10,
    });

    const result = await useCase.execute({
      email: 'user1',
      role: 'ADMIN',
      status: UserStatus.ACTIVE,
      page: 1,
      limit: 10,
    });

    expect(result.items.length).toBe(1);
    expect(result.items[0]?.email).toBe('user1@example.com');
    expect(result.total).toBe(1);
    expect(mockUserRepository.search).toHaveBeenCalledWith({
      email: 'user1',
      role: 'ADMIN',
      status: UserStatus.ACTIVE,
      page: 1,
      limit: 10,
    });
  });
});
