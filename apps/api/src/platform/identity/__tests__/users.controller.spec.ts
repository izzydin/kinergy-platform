import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { UsersController } from '../controllers/users.controller';
import {
  CreateUserUseCase,
  SearchUsersUseCase,
  UpdateUserUseCase,
  ActivateUserUseCase,
  DeactivateUserUseCase,
  DeleteUserUseCase,
  GetCurrentUserUseCase,
} from '../use-cases';
import { UserStatus } from '../domain/user-status.enum';

describe('UsersController Unit Tests', () => {
  let controller: UsersController;
  let mockCreateUserUseCase: jest.Mocked<CreateUserUseCase>;
  let mockSearchUsersUseCase: jest.Mocked<SearchUsersUseCase>;
  let mockUpdateUserUseCase: jest.Mocked<UpdateUserUseCase>;
  let mockActivateUserUseCase: jest.Mocked<ActivateUserUseCase>;
  let mockDeactivateUserUseCase: jest.Mocked<DeactivateUserUseCase>;
  let mockDeleteUserUseCase: jest.Mocked<DeleteUserUseCase>;
  let mockGetCurrentUserUseCase: jest.Mocked<GetCurrentUserUseCase>;

  const sampleUserResponse = {
    id: 'usr_12345',
    email: 'admin@kinergy.test',
    status: UserStatus.ACTIVE,
    roles: ['ADMIN'],
    permissions: ['users.read', 'users.write'],
    tenantId: 'tenant_1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  };

  beforeEach(() => {
    mockCreateUserUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<CreateUserUseCase>;

    mockSearchUsersUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<SearchUsersUseCase>;

    mockUpdateUserUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<UpdateUserUseCase>;

    mockActivateUserUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ActivateUserUseCase>;

    mockDeactivateUserUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<DeactivateUserUseCase>;

    mockDeleteUserUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<DeleteUserUseCase>;

    mockGetCurrentUserUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<GetCurrentUserUseCase>;

    controller = new UsersController(
      mockCreateUserUseCase,
      mockSearchUsersUseCase,
      mockUpdateUserUseCase,
      mockActivateUserUseCase,
      mockDeactivateUserUseCase,
      mockDeleteUserUseCase,
      mockGetCurrentUserUseCase,
    );
  });

  describe('createUser', () => {
    it('creates a user and returns enriched user response', async () => {
      mockCreateUserUseCase.execute.mockResolvedValueOnce(sampleUserResponse);

      const result = await controller.createUser({
        email: 'admin@kinergy.test',
        name: 'Admin User',
        role: 'ADMIN',
        tenantId: 'tenant_1',
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('usr_12345');
      expect(result.name).toBe('Admin User');
      expect(result.email).toBe('admin@kinergy.test');
      expect(mockCreateUserUseCase.execute).toHaveBeenCalledWith({
        email: 'admin@kinergy.test',
        password: undefined,
        role: 'ADMIN',
        tenantId: 'tenant_1',
      });
    });

    it('throws ConflictException when user email already exists', async () => {
      mockCreateUserUseCase.execute.mockRejectedValueOnce(
        new Error('User with this email address already exists.'),
      );

      await expect(
        controller.createUser({
          email: 'duplicate@kinergy.test',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException on invalid email format', async () => {
      mockCreateUserUseCase.execute.mockRejectedValueOnce(
        new Error('Invalid email address format.'),
      );

      await expect(
        controller.createUser({
          email: 'invalid-email',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('searchUsers', () => {
    it('searches users with pagination and query filtering', async () => {
      mockSearchUsersUseCase.execute.mockResolvedValueOnce({
        items: [sampleUserResponse],
        total: 1,
        page: 1,
        limit: 10,
      });

      const result = await controller.searchUsers({
        q: 'admin',
        page: 1,
        limit: 10,
      });

      expect(result).toBeDefined();
      expect(result.items.length).toBe(1);
      expect(result.total).toBe(1);
      expect(result.totalPages).toBe(1);
      expect(mockSearchUsersUseCase.execute).toHaveBeenCalledWith({
        email: 'admin',
        role: undefined,
        status: undefined,
        page: 1,
        limit: 10,
      });
    });
  });

  describe('getUserById', () => {
    it('retrieves user profile by ID', async () => {
      mockGetCurrentUserUseCase.execute.mockResolvedValueOnce({
        id: 'usr_12345',
        email: 'user@kinergy.test',
        status: UserStatus.ACTIVE,
        roles: ['USER'],
        permissions: [],
        tenantId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await controller.getUserById('usr_12345');
      expect(result.id).toBe('usr_12345');
      expect(result.email).toBe('user@kinergy.test');
      expect(result.name).toBe('user');
    });

    it('throws NotFoundException when user not found', async () => {
      mockGetCurrentUserUseCase.execute.mockRejectedValueOnce(new Error('User profile not found.'));

      await expect(controller.getUserById('non-existent')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when user ID is empty', async () => {
      await expect(controller.getUserById('   ')).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateUser', () => {
    it('updates user email and role', async () => {
      mockUpdateUserUseCase.execute.mockResolvedValueOnce({
        ...sampleUserResponse,
        email: 'updated@kinergy.test',
      });

      const result = await controller.updateUser('usr_12345', {
        email: 'updated@kinergy.test',
        name: 'Updated Name',
      });

      expect(result.email).toBe('updated@kinergy.test');
      expect(result.name).toBe('Updated Name');
    });

    it('supports patchUser alias', async () => {
      mockUpdateUserUseCase.execute.mockResolvedValueOnce(sampleUserResponse);

      const result = await controller.patchUser('usr_12345', {
        role: 'OPERATOR',
      });

      expect(result.id).toBe('usr_12345');
    });

    it('throws NotFoundException when updating non-existent user', async () => {
      mockUpdateUserUseCase.execute.mockRejectedValueOnce(
        new Error('User not found or has been soft-deleted.'),
      );

      await expect(
        controller.updateUser('missing-user', { email: 'new@kinergy.test' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('activateUser & deactivateUser', () => {
    it('activates user and returns updated response', async () => {
      mockActivateUserUseCase.execute.mockResolvedValueOnce({
        ...sampleUserResponse,
        status: UserStatus.ACTIVE,
      });

      const result = await controller.activateUser('usr_12345');
      expect(result.status).toBe(UserStatus.ACTIVE);
      expect(mockActivateUserUseCase.execute).toHaveBeenCalledWith({
        userId: 'usr_12345',
      });
    });

    it('supports patchActivateUser alias', async () => {
      mockActivateUserUseCase.execute.mockResolvedValueOnce(sampleUserResponse);

      const result = await controller.patchActivateUser('usr_12345');
      expect(result.id).toBe('usr_12345');
    });

    it('deactivates user and returns updated response', async () => {
      mockDeactivateUserUseCase.execute.mockResolvedValueOnce({
        ...sampleUserResponse,
        status: UserStatus.DEACTIVATED,
      });

      const result = await controller.deactivateUser('usr_12345');
      expect(result.status).toBe(UserStatus.DEACTIVATED);
      expect(mockDeactivateUserUseCase.execute).toHaveBeenCalledWith({
        userId: 'usr_12345',
      });
    });

    it('supports patchDeactivateUser alias', async () => {
      mockDeactivateUserUseCase.execute.mockResolvedValueOnce({
        ...sampleUserResponse,
        status: UserStatus.DEACTIVATED,
      });

      const result = await controller.patchDeactivateUser('usr_12345');
      expect(result.status).toBe(UserStatus.DEACTIVATED);
    });

    it('throws UnprocessableEntityException on illegal lifecycle transition', async () => {
      mockActivateUserUseCase.execute.mockRejectedValueOnce(
        new Error('Cannot activate user: already active.'),
      );

      await expect(controller.activateUser('usr_12345')).rejects.toThrow(
        UnprocessableEntityException,
      );
    });
  });

  describe('deleteUser', () => {
    it('soft deletes user and delegates to DeleteUserUseCase', async () => {
      mockDeleteUserUseCase.execute.mockResolvedValueOnce(sampleUserResponse);

      const result = await controller.deleteUser('usr_12345');
      expect(result).toBeDefined();
      expect(mockDeleteUserUseCase.execute).toHaveBeenCalledWith({
        userId: 'usr_12345',
      });
    });
  });
});
