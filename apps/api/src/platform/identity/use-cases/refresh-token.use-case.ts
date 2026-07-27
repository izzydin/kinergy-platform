import { randomUUID } from 'crypto';
import { IUseCase } from '../../../shared/common/use-case.interface';
import { IClock } from '../../../shared/common/clock.interface';
import { ILoggerPort } from '../../logging/logger-port.interface';
import { RefreshToken, IRefreshTokenRepository, IUserRepository } from '../domain';
import { IAccessTokenService } from '../tokens/access-token.service';
import { IRefreshTokenService } from '../tokens/refresh-token.service';
import { ITokenHasher } from '../tokens/token-hasher.interface';
import { AuthenticationResponse, RefreshTokenDto, UserProfileDto } from './dtos/auth.dtos';
import { AccountDisabledException, InvalidTokenException } from './exceptions/auth.exception';

/**
 * Use Case handling Refresh Token rotation and new Access Token issuance.
 * Implements cryptographic hash validation, token family rotation, and strict replay attack mitigation.
 */
export class RefreshTokenUseCase implements IUseCase<RefreshTokenDto, AuthenticationResponse> {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly refreshTokenRepository: IRefreshTokenRepository,
    private readonly tokenHasher: ITokenHasher,
    private readonly accessTokenService: IAccessTokenService,
    private readonly refreshTokenService: IRefreshTokenService,
    private readonly clock: IClock,
    private readonly logger?: ILoggerPort,
  ) {}

  async execute(request: RefreshTokenDto): Promise<AuthenticationResponse> {
    if (!request || !request.refreshToken) {
      throw new InvalidTokenException('Refresh token is required.');
    }

    const payload = await this.refreshTokenService.validateRefreshToken(request.refreshToken);
    if (!payload || !payload.sub || !payload.familyId) {
      this.logger?.warn(
        'Refresh token validation failed: invalid signature or payload',
        'RefreshTokenUseCase',
      );
      throw new InvalidTokenException('Invalid refresh token.');
    }

    const incomingHash = this.tokenHasher.hashToken(request.refreshToken);
    const tokenEntity = await this.refreshTokenRepository.findByHash(incomingHash);

    // REPLAY ATTACK MITIGATION:
    // If the presented token is not found in database or has already been revoked,
    // an attacker is attempting to replay a previously rotated or compromised token.
    if (!tokenEntity || tokenEntity.isRevoked) {
      this.logger?.error(
        `Security Alert: Refresh token replay attack detected for family (${payload.familyId}) and user (${payload.sub}). Revoking token family.`,
        undefined,
        'RefreshTokenUseCase',
      );
      await this.refreshTokenRepository.revokeFamily(payload.familyId);
      throw new InvalidTokenException('Refresh token reuse detected. Session revoked.');
    }

    // EXPIRATION VALIDATION
    if (tokenEntity.isExpired(this.clock.now())) {
      this.logger?.warn(
        `Refresh token expired for user (${tokenEntity.userId})`,
        'RefreshTokenUseCase',
      );
      tokenEntity.revoke();
      await this.refreshTokenRepository.save(tokenEntity);
      throw new InvalidTokenException('Refresh token expired.');
    }

    // USER & ACCOUNT STATUS VALIDATION
    const user = await this.userRepository.findById(tokenEntity.userId);
    if (!user) {
      this.logger?.warn(
        `Refresh token failed: user not found (${tokenEntity.userId})`,
        'RefreshTokenUseCase',
      );
      await this.refreshTokenRepository.revokeFamily(payload.familyId);
      throw new InvalidTokenException('User not found.');
    }

    if (!user.isActive()) {
      this.logger?.warn(
        `Refresh token rejected: user status is ${user.status} (${user.id})`,
        'RefreshTokenUseCase',
      );
      await this.refreshTokenRepository.revokeFamily(payload.familyId);
      throw new AccountDisabledException();
    }

    // ROTATE TOKEN (One-Time Use)
    tokenEntity.revoke();
    await this.refreshTokenRepository.save(tokenEntity);

    const newAccessToken = await this.accessTokenService.generateToken({
      userId: user.id,
      email: user.email,
      roles: user.roles,
      permissions: user.permissions,
      tokenVersion: user.tokenVersion,
      tenantId: user.tenantId,
    });

    const newRefreshTokenResult = await this.refreshTokenService.generateRefreshToken({
      userId: user.id,
      familyId: payload.familyId,
      tokenVersion: user.tokenVersion,
      tenantId: user.tenantId,
    });

    const newHash = this.tokenHasher.hashToken(newRefreshTokenResult.token);
    const expiresAt = new Date(this.clock.now().getTime() + 7 * 24 * 60 * 60 * 1000);

    const newRefreshTokenEntity = new RefreshToken({
      id: randomUUID(),
      tokenHash: newHash,
      familyId: payload.familyId,
      userId: user.id,
      isRevoked: false,
      expiresAt,
    });

    await this.refreshTokenRepository.save(newRefreshTokenEntity);

    this.logger?.log(
      `Refresh token rotated successfully for user (${user.id})`,
      'RefreshTokenUseCase',
    );

    const userProfile: UserProfileDto = {
      id: user.id,
      email: user.email,
      status: user.status,
      roles: user.roles,
      permissions: user.permissions,
      tenantId: user.tenantId,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshTokenResult.token,
      tokenType: 'Bearer',
      expiresIn: 900,
      user: userProfile,
    };
  }
}
