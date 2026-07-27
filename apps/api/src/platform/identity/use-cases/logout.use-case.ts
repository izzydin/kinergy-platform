import { IUseCase } from '../../../shared/common/use-case.interface';
import { ILoggerPort } from '../../logging/logger-port.interface';
import { IRefreshTokenRepository, IUserRepository } from '../domain';
import { IRefreshTokenService } from '../tokens/refresh-token.service';
import { ITokenHasher } from '../tokens/token-hasher.interface';
import { LogoutDto } from './dtos/auth.dtos';

export interface LogoutResponse {
  success: boolean;
}

/**
 * Use Case handling user logout.
 * Revokes refresh token sessions by hash/family or revokes all active sessions for a user.
 */
export class LogoutUseCase implements IUseCase<LogoutDto, LogoutResponse> {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly refreshTokenRepository: IRefreshTokenRepository,
    private readonly refreshTokenService: IRefreshTokenService,
    private readonly tokenHasher: ITokenHasher,
    private readonly logger?: ILoggerPort,
  ) {}

  async execute(request?: LogoutDto): Promise<LogoutResponse> {
    if (request?.refreshToken) {
      try {
        const hashedToken = this.tokenHasher.hashToken(request.refreshToken);
        const tokenEntity = await this.refreshTokenRepository.findByHash(hashedToken);

        if (tokenEntity) {
          await this.refreshTokenRepository.revokeFamily(tokenEntity.familyId);
          this.logger?.log(
            `Revoked refresh token family (${tokenEntity.familyId}) for user (${tokenEntity.userId})`,
            'LogoutUseCase',
          );
        } else {
          const payload = await this.refreshTokenService.validateRefreshToken(request.refreshToken);
          if (payload?.familyId) {
            await this.refreshTokenRepository.revokeFamily(payload.familyId);
          } else if (payload?.sub) {
            await this.refreshTokenRepository.revokeAllForUser(payload.sub);
          }
        }
      } catch {
        // Fallback safely if token payload parsing fails
      }
    }

    if (request?.userId) {
      await this.refreshTokenRepository.revokeAllForUser(request.userId);
      const user = await this.userRepository.findById(request.userId);
      if (user) {
        user.clearRefreshToken();
        await this.userRepository.save(user);
      }
      this.logger?.log(`Revoked all sessions for user (${request.userId})`, 'LogoutUseCase');
    }

    return { success: true };
  }
}
