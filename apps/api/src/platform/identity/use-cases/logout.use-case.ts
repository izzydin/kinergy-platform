import { randomUUID } from 'crypto';
import { IUseCase } from '../../../shared/common/use-case.interface';
import { ILoggerPort } from '../../logging/logger-port.interface';
import { IRefreshTokenRepository, IUserRepository } from '../domain';
import { ISecurityEventPublisher } from '../events/security-event-publisher.interface';
import { IRefreshTokenService } from '../tokens/refresh-token.service';
import { ITokenHasher } from '../tokens/token-hasher.interface';
import { LogoutDto } from './dtos/auth.dtos';

export interface LogoutResponse {
  success: boolean;
}

/**
 * Use Case handling user logout.
 * Revokes refresh token sessions and publishes LogoutSucceeded security events via ISecurityEventPublisher.
 */
export class LogoutUseCase implements IUseCase<LogoutDto, LogoutResponse> {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly refreshTokenRepository: IRefreshTokenRepository,
    private readonly refreshTokenService: IRefreshTokenService,
    private readonly tokenHasher: ITokenHasher,
    private readonly eventPublisher?: ISecurityEventPublisher,
    private readonly logger?: ILoggerPort,
  ) {}

  async execute(request?: LogoutDto): Promise<LogoutResponse> {
    let resolvedUserId = request?.userId;

    if (request?.refreshToken) {
      try {
        const hashedToken = this.tokenHasher.hashToken(request.refreshToken);
        const tokenEntity = await this.refreshTokenRepository.findByHash(hashedToken);

        if (tokenEntity) {
          resolvedUserId = resolvedUserId || tokenEntity.userId;
          await this.refreshTokenRepository.revokeFamily(tokenEntity.familyId);
          this.logger?.log(
            `Revoked refresh token family (${tokenEntity.familyId}) for user (${tokenEntity.userId})`,
            'LogoutUseCase',
          );
        } else {
          const payload = await this.refreshTokenService.validateRefreshToken(request.refreshToken);
          if (payload?.familyId) {
            resolvedUserId = resolvedUserId || payload.sub;
            await this.refreshTokenRepository.revokeFamily(payload.familyId);
          } else if (payload?.sub) {
            resolvedUserId = resolvedUserId || payload.sub;
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

    if (resolvedUserId) {
      await this.eventPublisher?.publish({
        eventId: randomUUID(),
        eventType: 'LogoutSucceeded',
        timestamp: new Date(),
        userId: resolvedUserId,
      });
    }

    return { success: true };
  }
}
