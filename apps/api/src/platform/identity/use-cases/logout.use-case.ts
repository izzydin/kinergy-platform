import { IUseCase } from '../../../shared/common/use-case.interface';
import { ILoggerPort } from '../../logging/logger-port.interface';
import { IUserRepository } from '../domain/user.repository.interface';
import { IRefreshTokenService } from '../tokens/refresh-token.service';
import { LogoutDto } from './dtos/auth.dtos';

export interface LogoutResponse {
  success: boolean;
}

/**
 * Use Case handling user logout.
 * Invalidates current refresh tokens and session references.
 */
export class LogoutUseCase implements IUseCase<LogoutDto, LogoutResponse> {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly refreshTokenService: IRefreshTokenService,
    private readonly logger?: ILoggerPort,
  ) {}

  async execute(request?: LogoutDto): Promise<LogoutResponse> {
    let targetUserId = request?.userId;

    if (!targetUserId && request?.refreshToken) {
      const payload = await this.refreshTokenService.validateRefreshToken(request.refreshToken);
      if (payload?.sub) {
        targetUserId = payload.sub;
      }
    }

    if (targetUserId) {
      const user = await this.userRepository.findById(targetUserId);
      if (user) {
        user.clearRefreshToken();
        await this.userRepository.save(user);
        this.logger?.log(`User logged out successfully (${targetUserId})`, 'LogoutUseCase');
      }
    }

    return { success: true };
  }
}
