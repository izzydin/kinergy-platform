import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { IUseCase } from '../../../../shared/common';
import { IPasswordHasher, PASSWORD_HASHER } from '../../password';
import { IUserRepository, User, USER_REPOSITORY, UserStatus } from '../../domain';
import { AuthException } from '../exceptions/auth.exception';
import { CreateUserDto, UserResponseDto } from './dtos/admin-user.dtos';

const emailSchema = z.string().email('Invalid email address format.');

@Injectable()
export class CreateUserUseCase implements IUseCase<CreateUserDto, UserResponseDto> {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    @Inject(PASSWORD_HASHER)
    private readonly passwordHasher: IPasswordHasher,
  ) {}

  async execute(dto: CreateUserDto): Promise<UserResponseDto> {
    const emailValidation = emailSchema.safeParse(dto.email);
    if (!emailValidation.success) {
      throw new AuthException(
        emailValidation.error.errors[0]?.message ?? 'Invalid email address format.',
      );
    }

    const normalizedEmail = dto.email.trim().toLowerCase();

    const existingUser = await this.userRepository.findByEmail(normalizedEmail);
    if (existingUser) {
      throw new AuthException('User with this email address already exists.');
    }

    const rawPassword = dto.password ?? `P@ss-${Math.random().toString(36).slice(-8)}`;
    const passwordHash = await this.passwordHasher.hash(rawPassword);

    const role = dto.role ?? 'USER';
    const userId = `usr_${Math.random().toString(36).substring(2, 11)}`;

    const user = new User({
      id: userId,
      email: normalizedEmail,
      passwordHash,
      status: UserStatus.ACTIVE,
      roles: [role],
      permissions: [],
      tenantId: dto.tenantId ?? null,
    });

    await this.userRepository.create(user);

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
