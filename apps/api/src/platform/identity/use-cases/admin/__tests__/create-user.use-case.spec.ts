import { IPasswordHasher } from '../../../password';
import { IUserRepository, User, UserStatus } from '../../../domain';
import { AuthException } from '../../exceptions/auth.exception';
import { CreateUserUseCase } from '../create-user.use-case';

describe('CreateUserUseCase', () => {
  let useCase: CreateUserUseCase;
  let mockUserRepository: jest.Mocked<IUserRepository>;
  let mockPasswordHasher: jest.Mocked<IPasswordHasher>;

  beforeEach(() => {
    mockUserRepository = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      create: jest.fn().mockResolvedValue(undefined),
      save: jest.fn(),
      search: jest.fn(),
      updateRefreshToken: jest.fn(),
    };

    mockPasswordHasher = {
      hash: jest.fn().mockResolvedValue('hashed_pwd_123'),
      verify: jest.fn(),
    };

    useCase = new CreateUserUseCase(mockUserRepository, mockPasswordHasher);
  });

  it('should successfully create a new user account', async () => {
    mockUserRepository.findByEmail.mockResolvedValue(null);

    const result = await useCase.execute({
      email: 'newuser@example.com',
      password: 'SecurePassword123!',
      role: 'MANAGER',
    });

    expect(result).toBeDefined();
    expect(result.email).toBe('newuser@example.com');
    expect(result.roles).toContain('MANAGER');
    expect(result.status).toBe(UserStatus.ACTIVE);
    expect(mockPasswordHasher.hash).toHaveBeenCalledWith('SecurePassword123!');
    expect(mockUserRepository.create).toHaveBeenCalled();
  });

  it('should throw AuthException on invalid email format', async () => {
    await expect(
      useCase.execute({
        email: 'invalid-email',
      }),
    ).rejects.toThrow(AuthException);
  });

  it('should throw AuthException if user with email already exists', async () => {
    mockUserRepository.findByEmail.mockResolvedValue(
      new User({
        id: 'usr_existing',
        email: 'existing@example.com',
        passwordHash: 'hash',
        status: UserStatus.ACTIVE,
        roles: ['USER'],
        permissions: [],
      }),
    );

    await expect(
      useCase.execute({
        email: 'existing@example.com',
      }),
    ).rejects.toThrow('User with this email address already exists.');
  });
});
