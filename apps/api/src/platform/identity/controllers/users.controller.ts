import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  NotFoundException,
  ConflictException,
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { AuthenticationGuard } from '../guards/authentication.guard';
import { AuthorizationGuard } from '../authorization/authorization.guard';
import { Permissions } from '../decorators';
import {
  CreateUserUseCase,
  SearchUsersUseCase,
  UpdateUserUseCase,
  ActivateUserUseCase,
  DeactivateUserUseCase,
  DeleteUserUseCase,
  GetCurrentUserUseCase,
} from '../use-cases';
import {
  CreateUserRequestDto,
  UpdateUserRequestDto,
  SearchUsersQueryRequestDto,
} from './dtos/users.dto';
import { UserResponseDto } from '../use-cases/admin/dtos/admin-user.dtos';

@ApiTags('Admin - Users')
@ApiBearerAuth()
@Controller(['admin/users', 'users'])
@UseGuards(AuthenticationGuard, AuthorizationGuard)
export class UsersController {
  constructor(
    private readonly createUserUseCase: CreateUserUseCase,
    private readonly searchUsersUseCase: SearchUsersUseCase,
    private readonly updateUserUseCase: UpdateUserUseCase,
    private readonly activateUserUseCase: ActivateUserUseCase,
    private readonly deactivateUserUseCase: DeactivateUserUseCase,
    private readonly deleteUserUseCase: DeleteUserUseCase,
    private readonly getCurrentUserUseCase: GetCurrentUserUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Permissions('users.write')
  @ApiOperation({ summary: 'Create new user account' })
  @ApiResponse({ status: 201, description: 'User created successfully' })
  @ApiResponse({ status: 400, description: 'Validation error in payload' })
  @ApiResponse({ status: 401, description: 'Unauthenticated access' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  @ApiResponse({ status: 409, description: 'Email address already exists' })
  public async createUser(@Body() dto: CreateUserRequestDto) {
    try {
      const created = await this.createUserUseCase.execute({
        email: dto.email,
        password: dto.password,
        role: dto.role,
        tenantId: dto.tenantId,
      });
      return this.toManagedUser(created, dto.name);
    } catch (error) {
      this.handleError(error);
    }
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @Permissions('users.read')
  @ApiOperation({ summary: 'Search and paginate user directory' })
  @ApiResponse({ status: 200, description: 'Paginated user list retrieved' })
  @ApiResponse({ status: 401, description: 'Unauthenticated access' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  public async searchUsers(@Query() query: SearchUsersQueryRequestDto) {
    try {
      const emailFilter = query.email ?? query.q;
      const result = await this.searchUsersUseCase.execute({
        email: emailFilter,
        role: query.role,
        status: query.status,
        page: query.page ?? 1,
        limit: query.limit ?? 10,
      });

      const items = result.items.map((u) => this.toManagedUser(u));
      const totalPages = Math.ceil(result.total / (result.limit || 10)) || 1;

      return {
        items,
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages,
      };
    } catch (error) {
      this.handleError(error);
    }
  }

  @Get(':userId')
  @HttpCode(HttpStatus.OK)
  @Permissions('users.read')
  @ApiOperation({ summary: 'Retrieve single user by unique identifier' })
  @ApiParam({ name: 'userId', description: 'User unique identifier' })
  @ApiResponse({ status: 200, description: 'User profile retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthenticated access' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  @ApiResponse({ status: 404, description: 'User profile not found' })
  public async getUserById(@Param('userId') userId: string) {
    try {
      if (!userId || userId.trim().length === 0) {
        throw new BadRequestException('User ID cannot be empty.');
      }
      const user = await this.getCurrentUserUseCase.execute({ userId });
      return {
        id: user.id,
        email: user.email,
        name: user.email.split('@')[0],
        status: user.status,
        roles: user.roles,
        permissions: user.permissions,
        tenantId: user.tenantId,
        createdAt:
          user.createdAt instanceof Date ? user.createdAt.toISOString() : String(user.createdAt),
        updatedAt:
          user.updatedAt instanceof Date ? user.updatedAt.toISOString() : String(user.updatedAt),
        lastLoginAt: null,
      };
    } catch (error) {
      this.handleError(error);
    }
  }

  @Put(':userId')
  @HttpCode(HttpStatus.OK)
  @Permissions('users.write')
  @ApiOperation({ summary: 'Update user profile and roles' })
  @ApiParam({ name: 'userId', description: 'User unique identifier' })
  @ApiResponse({ status: 200, description: 'User updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid update payload' })
  @ApiResponse({ status: 401, description: 'Unauthenticated access' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 409, description: 'Email address already exists' })
  public async updateUser(@Param('userId') userId: string, @Body() dto: UpdateUserRequestDto) {
    try {
      if (!userId || userId.trim().length === 0) {
        throw new BadRequestException('User ID cannot be empty.');
      }
      const updated = await this.updateUserUseCase.execute({
        userId,
        email: dto.email,
        role: dto.role,
      });
      return this.toManagedUser(updated, dto.name);
    } catch (error) {
      this.handleError(error);
    }
  }

  @Patch(':userId')
  @HttpCode(HttpStatus.OK)
  @Permissions('users.write')
  @ApiOperation({ summary: 'Patch user profile and roles (alias)' })
  @ApiParam({ name: 'userId', description: 'User unique identifier' })
  @ApiResponse({ status: 200, description: 'User updated successfully' })
  public async patchUser(@Param('userId') userId: string, @Body() dto: UpdateUserRequestDto) {
    return this.updateUser(userId, dto);
  }

  @Post(':userId/activate')
  @HttpCode(HttpStatus.OK)
  @Permissions('users.write')
  @ApiOperation({ summary: 'Activate user account' })
  @ApiParam({ name: 'userId', description: 'User unique identifier' })
  @ApiResponse({ status: 200, description: 'User account activated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthenticated access' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 422, description: 'Invalid account lifecycle state transition' })
  public async activateUser(@Param('userId') userId: string) {
    try {
      if (!userId || userId.trim().length === 0) {
        throw new BadRequestException('User ID cannot be empty.');
      }
      const activated = await this.activateUserUseCase.execute({ userId });
      return this.toManagedUser(activated);
    } catch (error) {
      this.handleError(error);
    }
  }

  @Patch(':userId/activate')
  @HttpCode(HttpStatus.OK)
  @Permissions('users.write')
  @ApiOperation({ summary: 'Activate user account (alias)' })
  @ApiParam({ name: 'userId', description: 'User unique identifier' })
  @ApiResponse({ status: 200, description: 'User account activated successfully' })
  public async patchActivateUser(@Param('userId') userId: string) {
    return this.activateUser(userId);
  }

  @Post(':userId/deactivate')
  @HttpCode(HttpStatus.OK)
  @Permissions('users.delete')
  @ApiOperation({ summary: 'Deactivate user account' })
  @ApiParam({ name: 'userId', description: 'User unique identifier' })
  @ApiResponse({ status: 200, description: 'User account deactivated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthenticated access' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 422, description: 'Invalid account lifecycle state transition' })
  public async deactivateUser(@Param('userId') userId: string) {
    try {
      if (!userId || userId.trim().length === 0) {
        throw new BadRequestException('User ID cannot be empty.');
      }
      const deactivated = await this.deactivateUserUseCase.execute({ userId });
      return this.toManagedUser(deactivated);
    } catch (error) {
      this.handleError(error);
    }
  }

  @Patch(':userId/deactivate')
  @HttpCode(HttpStatus.OK)
  @Permissions('users.delete')
  @ApiOperation({ summary: 'Deactivate user account (alias)' })
  @ApiParam({ name: 'userId', description: 'User unique identifier' })
  @ApiResponse({ status: 200, description: 'User account deactivated successfully' })
  public async patchDeactivateUser(@Param('userId') userId: string) {
    return this.deactivateUser(userId);
  }

  @Delete(':userId')
  @HttpCode(HttpStatus.OK)
  @Permissions('users.delete')
  @ApiOperation({ summary: 'Soft delete user account' })
  @ApiParam({ name: 'userId', description: 'User unique identifier' })
  @ApiResponse({ status: 200, description: 'User account soft deleted' })
  @ApiResponse({ status: 401, description: 'Unauthenticated access' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  @ApiResponse({ status: 404, description: 'User not found' })
  public async deleteUser(@Param('userId') userId: string) {
    try {
      if (!userId || userId.trim().length === 0) {
        throw new BadRequestException('User ID cannot be empty.');
      }
      return await this.deleteUserUseCase.execute({ userId });
    } catch (error) {
      this.handleError(error);
    }
  }

  private toManagedUser(user: UserResponseDto, fallbackName?: string) {
    const derivedName = fallbackName || user.email.split('@')[0];
    return {
      id: user.id,
      email: user.email,
      name: derivedName,
      status: user.status,
      roles: user.roles,
      permissions: user.permissions,
      tenantId: user.tenantId,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      deletedAt: user.deletedAt ?? null,
      lastLoginAt: null,
    };
  }

  private handleError(error: unknown): never {
    if (
      error instanceof NotFoundException ||
      error instanceof ConflictException ||
      error instanceof BadRequestException ||
      error instanceof UnprocessableEntityException
    ) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('not found') || message.includes('No active user')) {
      throw new NotFoundException(message);
    }
    if (message.includes('already exists')) {
      throw new ConflictException(message);
    }
    if (
      message.includes('Cannot activate') ||
      message.includes('Cannot deactivate') ||
      message.includes('Failed to activate') ||
      message.includes('Failed to deactivate') ||
      message.includes('status transition') ||
      message.includes('transition')
    ) {
      throw new UnprocessableEntityException(message);
    }
    if (message.includes('Invalid')) {
      throw new BadRequestException(message);
    }

    throw new BadRequestException(message);
  }
}
