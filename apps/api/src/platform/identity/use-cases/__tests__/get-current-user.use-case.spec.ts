import { User, UserStatus } from '../../domain';
import { IUserRepository } from '../../domain/user.repository.interface';
import { RequestContext } from '../../request-context';
import { GetCurrentUserUseCase } from '../get-current-user.use-case';
import { UserNotFoundException } from '../exceptions/auth.exception';

describe('GetCurrentUserUseCase', () => {
  let useCase: GetCurrentUserUseCase;
  let mockUserRepository: jest.Mocked<IUserRepository>;

  const testUser = new User({
    id: 'usr_123',
    email: 'test@example.com',
    passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$secretpasswordhash',
    status: UserStatus.ACTIVE,
    roles: ['ADMIN'],
    permissions: ['write:all'],
    tenantId: 'tenant_1',
    hashedRefreshToken: 'secret_refresh_hash',
  });

  beforeEach(() => {
    mockUserRepository = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      search: jest.fn(),
      updateRefreshToken: jest.fn(),
    };

    useCase = new GetCurrentUserUseCase(mockUserRepository);
  });

  it('should return user profile successfully when userId is provided in request', async () => {
    mockUserRepository.findById.mockResolvedValue(testUser);

    const result = await useCase.execute({ userId: 'usr_123' });

    expect(mockUserRepository.findById).toHaveBeenCalledWith('usr_123');
    expect(result).toEqual({
      id: 'usr_123',
      email: 'test@example.com',
      status: UserStatus.ACTIVE,
      roles: ['ADMIN'],
      permissions: ['write:all'],
      tenantId: 'tenant_1',
      createdAt: testUser.createdAt,
      updatedAt: testUser.updatedAt,
    });
    // Verify password hash and refresh token hash are NEVER exposed
    expect(result).not.toHaveProperty('passwordHash');
    expect(result).not.toHaveProperty('hashedRefreshToken');
  });

  it('should return user profile from RequestContext when request.userId is omitted', async () => {
    mockUserRepository.findById.mockResolvedValue(testUser);

    const contextIdentity = {
      userId: 'usr_123',
      email: 'test@example.com',
      roles: ['ADMIN'],
      permissions: ['write:all'],
    };

    await RequestContext.run(contextIdentity, async () => {
      const result = await useCase.execute();
      expect(result.id).toBe('usr_123');
      expect(result.email).toBe('test@example.com');
    });
  });

  it('should throw UserNotFoundException if no user ID is in request or RequestContext', async () => {
    await expect(useCase.execute()).rejects.toThrow(UserNotFoundException);
  });

  it('should throw UserNotFoundException if user is not found in repository', async () => {
    mockUserRepository.findById.mockResolvedValue(null);

    await expect(useCase.execute({ userId: 'nonexistent' })).rejects.toThrow(UserNotFoundException);
  });
});
