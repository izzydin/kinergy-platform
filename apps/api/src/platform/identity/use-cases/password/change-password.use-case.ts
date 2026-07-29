import { Inject, Injectable, Optional } from '@nestjs/common';
import { IUseCase } from '../../../../shared/common';
import { ISecurityEventPublisher, SECURITY_EVENT_PUBLISHER } from '../../events';
import {
  IPasswordHasher,
  IPasswordPolicyConfiguration,
  PASSWORD_HASHER,
  PASSWORD_POLICY_CONFIGURATION,
  PasswordPolicyService,
} from '../../password';
import { IUserRepository, USER_REPOSITORY } from '../../domain';
import { AuthException } from '../exceptions/auth.exception';
import { ChangePasswordDto } from './dtos/password.dtos';

@Injectable()
export class ChangePasswordUseCase implements IUseCase<ChangePasswordDto, { success: boolean }> {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    @Inject(PASSWORD_HASHER)
    private readonly passwordHasher: IPasswordHasher,
    private readonly passwordPolicyService: PasswordPolicyService,
    @Inject(SECURITY_EVENT_PUBLISHER)
    private readonly securityEventPublisher: ISecurityEventPublisher,
    @Inject(PASSWORD_POLICY_CONFIGURATION)
    @Optional()
    private readonly policyConfig?: IPasswordPolicyConfiguration,
  ) {}

  async execute(dto: ChangePasswordDto): Promise<{ success: boolean }> {
    const user = await this.userRepository.findById(dto.userId);
    if (!user || user.isDeleted()) {
      throw new AuthException('User not found or has been soft-deleted.');
    }

    const isValidCurrent = await this.passwordHasher.verify(dto.currentPassword, user.passwordHash);

    if (!isValidCurrent) {
      throw new AuthException('Invalid current password.');
    }

    // Direct string match check
    if (dto.currentPassword === dto.newPassword) {
      throw new AuthException('New password must differ from current password.');
    }

    // Verify candidate password against current password hash
    const isSameAsCurrentHash = await this.passwordHasher.verify(
      dto.newPassword,
      user.passwordHash,
    );
    if (isSameAsCurrentHash) {
      throw new AuthException('New password must differ from current password.');
    }

    // Password Reuse Prevention: check historical password hashes
    for (const historicalHash of user.passwordHistory) {
      const isHistoricalMatch = await this.passwordHasher.verify(dto.newPassword, historicalHash);
      if (isHistoricalMatch) {
        throw new AuthException('Password has been used recently. Please choose a new password.');
      }
    }

    try {
      this.passwordPolicyService.validateOrThrow(dto.newPassword);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Password policy validation failed.';
      throw new AuthException(message);
    }

    const newPasswordHash = await this.passwordHasher.hash(dto.newPassword);
    const historyLimit = this.policyConfig?.getPasswordHistoryLimit() ?? 5;

    try {
      user.changePassword(newPasswordHash, historyLimit);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to change password.';
      throw new AuthException(message);
    }

    await this.userRepository.save(user);

    await this.securityEventPublisher.publish({
      eventId: `evt_${Math.random().toString(36).substring(2, 11)}`,
      eventType: 'PasswordChanged',
      timestamp: new Date(),
      userId: user.id,
      email: user.email,
      tenantId: user.tenantId,
    });

    return { success: true };
  }
}
