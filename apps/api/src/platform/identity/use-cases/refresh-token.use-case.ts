import { IUseCase } from '../../../shared/common/use-case.interface';
import { IClock } from '../../../shared/common/clock.interface';
import { ILoggerPort } from '../../logging/logger-port.interface';
import { IUserRepository } from '../domain/user.repository.interface';
import { IPasswordHasher } from '../password/password-hasher.interface';
import { IAccessTokenService } from '../tokens/access-token.service';
import { IRefreshTokenService } from '../tokens/refresh-token.service';
import { AuthenticationResponse, RefreshTokenDto, UserProfileDto } from './dtos/auth.dtos';
import { AccountDisabledException, InvalidTokenException } from './exceptions/auth.exception';

/**
 * Use Case handling Refresh Token rotation and new Access Token issuance.
 * Includes security checks for token expiration and token reuse detection.
 */
export class RefreshTokenUseCase implements IUseCase<RefreshTokenDto, AuthenticationResponse> {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly passwordHasher: IPasswordHasher,
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
    if (!payload || !payload.sub) {
      this.logger?.warn(
        'Refresh token validation failed: invalid signature or payload',
        'RefreshTokenUseCase',
      );
      throw new InvalidTokenException();
    }

    const user = await this.userRepository.findById(payload.sub);
    if (!user) {
      this.logger?.warn(
        `Refresh token failed: user not found (${payload.sub})`,
        'RefreshTokenUseCase',
      );
      throw new InvalidTokenException();
    }

    if (!user.isActive()) {
      this.logger?.warn(
        `Refresh token rejected: user status is ${user.status} (${user.id})`,
        'RefreshTokenUseCase',
      );
      throw new AccountDisabledException();
    }

    if (!user.hashedRefreshToken) {
      this.logger?.warn(
        `Refresh token rejected: no active refresh token stored for user (${user.id})`,
        'RefreshTokenUseCase',
      );
      throw new InvalidTokenException('Refresh token has been revoked.');
    }

    if (user.refreshTokenExpiresAt && this.clock.now() > user.refreshTokenExpiresAt) {
      this.logger?.warn(
        `Refresh token rejected: token expired for user (${user.id})`,
        'RefreshTokenUseCase',
      );
      user.clearRefreshToken();
      await this.userRepository.save(user);
      throw new InvalidTokenException('Refresh token expired.');
    }

    const isTokenMatching = await this.passwordHasher.verify(
      request.refreshToken,
      user.hashedRefreshToken,
    );

    if (!isTokenMatching) {
      this.logger?.error(
        `Security Alert: Refresh token mismatch / reuse attempt detected for user (${user.id})`,
        undefined,
        'RefreshTokenUseCase',
      );
      // Security measure: Revoke refresh token and increment token version
      user.clearRefreshToken();
      user.incrementTokenVersion();
      await this.userRepository.save(user);
      throw new InvalidTokenException('Invalid refresh token.');
    }

    // Token Rotation: Generate new Access Token and Refresh Token
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

    const newHashedRefreshToken = await this.passwordHasher.hash(newRefreshTokenResult.token);
    const expiresAt = new Date(this.clock.now().getTime() + 7 * 24 * 60 * 60 * 1000);

    user.setRefreshToken(newHashedRefreshToken, expiresAt);
    await this.userRepository.save(user);

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
