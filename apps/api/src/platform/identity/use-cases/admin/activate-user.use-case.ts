import { Inject, Injectable } from '@nestjs/common';
import { IUseCase } from '../../../../shared/common';
import { IUserRepository, USER_REPOSITORY } from '../../domain';
import { AuthException } from '../exceptions/auth.exception';
import { UserResponseDto } from './dtos/admin-user.dtos';

@Injectable()
export class ActivateUserUseCase implements IUseCase<{ userId: string }, UserResponseDto> {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
  ) {}

  async execute(request: { userId: string }): Promise<UserResponseDto> {
    const user = await this.userRepository.findById(request.userId);
    if (!user || user.isDeleted()) {
      throw new AuthException('User not found or has been soft-deleted.');
    }

    try {
      user.activate();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to activate user.';
      throw new AuthException(message);
    }

    await this.userRepository.save(user);

    return {
      id: user.id,
      email: user.email,
      status: user.status,
      roles: user.roles,
      permissions: user.permissions,
      tenantId: user.tenantId,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      deletedAt: user.deletedAt ? user.deletedAt.toISOString() : null,
    };
  }
}
