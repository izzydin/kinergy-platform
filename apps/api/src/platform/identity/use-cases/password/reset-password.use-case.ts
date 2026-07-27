import { Inject, Injectable } from '@nestjs/common';
import { IUseCase } from '../../../../shared/common';
import { ISecurityEventPublisher, SECURITY_EVENT_PUBLISHER } from '../../events';
import {
  IPasswordHasher,
  PASSWORD_HASHER,
  TemporaryPasswordGeneratorService,
} from '../../password';
import { IUserRepository, USER_REPOSITORY } from '../../domain';
import { AuthException } from '../exceptions/auth.exception';
import { ResetPasswordDto, ResetPasswordResultDto } from './dtos/password.dtos';

@Injectable()
export class ResetPasswordUseCase implements IUseCase<ResetPasswordDto, ResetPasswordResultDto> {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    @Inject(PASSWORD_HASHER)
    private readonly passwordHasher: IPasswordHasher,
    private readonly temporaryPasswordGeneratorService: TemporaryPasswordGeneratorService,
    @Inject(SECURITY_EVENT_PUBLISHER)
    private readonly securityEventPublisher: ISecurityEventPublisher,
  ) {}

  async execute(dto: ResetPasswordDto): Promise<ResetPasswordResultDto> {
    const user = await this.userRepository.findById(dto.userId);
    if (!user || user.isDeleted()) {
      throw new AuthException('User not found or has been soft-deleted.');
    }

    const temporaryPassword = this.temporaryPasswordGeneratorService.generate(16);
    const tempPasswordHash = await this.passwordHasher.hash(temporaryPassword);

    try {
      user.changePassword(tempPasswordHash);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to reset password.';
      throw new AuthException(message);
    }

    await this.userRepository.save(user);

    await this.securityEventPublisher.publish({
      eventId: `evt_${Math.random().toString(36).substring(2, 11)}`,
      eventType: 'PasswordResetByAdmin',
      timestamp: new Date(),
      userId: user.id,
      email: user.email,
      tenantId: user.tenantId,
      metadata: {
        adminId: dto.adminId ?? null,
      },
    });

    return {
      userId: user.id,
      temporaryPassword,
    };
  }
}
