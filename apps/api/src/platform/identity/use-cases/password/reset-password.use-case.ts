import { Inject, Injectable, Optional } from '@nestjs/common';
import { IUseCase } from '../../../../shared/common';
import { ISecurityEventPublisher, SECURITY_EVENT_PUBLISHER } from '../../events';
import {
  IPasswordHasher,
  IPasswordPolicyConfiguration,
  PASSWORD_HASHER,
  PASSWORD_POLICY_CONFIGURATION,
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
    @Inject(PASSWORD_POLICY_CONFIGURATION)
    @Optional()
    private readonly policyConfig?: IPasswordPolicyConfiguration,
  ) {}

  async execute(dto: ResetPasswordDto): Promise<ResetPasswordResultDto> {
    const user = await this.userRepository.findById(dto.userId);
    if (!user || user.isDeleted()) {
      throw new AuthException('User not found or has been soft-deleted.');
    }

    const minLen = this.policyConfig?.getMinLength() ?? 12;
    const tempPasswordLen = Math.max(16, minLen + 4);
    const temporaryPassword = this.temporaryPasswordGeneratorService.generate(tempPasswordLen);
    const tempPasswordHash = await this.passwordHasher.hash(temporaryPassword);
    const historyLimit = this.policyConfig?.getPasswordHistoryLimit() ?? 5;

    try {
      user.changePassword(tempPasswordHash, historyLimit);
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
