import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { IUseCase } from '../../../../shared/common';
import { IUserRepository, USER_REPOSITORY } from '../../domain';
import { AuthException } from '../exceptions/auth.exception';
import { UpdateUserDto, UserResponseDto } from './dtos/admin-user.dtos';

const emailSchema = z.string().email('Invalid email address format.');

@Injectable()
export class UpdateUserUseCase implements IUseCase<UpdateUserDto, UserResponseDto> {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
  ) {}

  async execute(dto: UpdateUserDto): Promise<UserResponseDto> {
    const user = await this.userRepository.findById(dto.userId);
    if (!user || user.isDeleted()) {
      throw new AuthException('User not found or has been soft-deleted.');
    }

    if (dto.email && dto.email.trim().toLowerCase() !== user.email) {
      const emailValidation = emailSchema.safeParse(dto.email);
      if (!emailValidation.success) {
        throw new AuthException(
          emailValidation.error.errors[0]?.message ?? 'Invalid email address format.',
        );
      }

      const normalizedEmail = dto.email.trim().toLowerCase();
      const existingUser = await this.userRepository.findByEmail(normalizedEmail);
      if (existingUser && existingUser.id !== user.id) {
        throw new AuthException('User with this email address already exists.');
      }

      user.updateEmail(normalizedEmail);
    }

    if (dto.role) {
      user.updateRoles([dto.role]);
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
