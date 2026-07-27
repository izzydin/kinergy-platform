import { randomUUID } from 'crypto';
import { IUseCase } from '../../../shared/common/use-case.interface';
import { IClock } from '../../../shared/common/clock.interface';
import { ILoggerPort } from '../../logging/logger-port.interface';
import { RefreshToken, IRefreshTokenRepository, IUserRepository } from '../domain';
import { IPasswordHasher } from '../password/password-hasher.interface';
import { IAccessTokenService } from '../tokens/access-token.service';
import { IRefreshTokenService } from '../tokens/refresh-token.service';
import { ITokenHasher } from '../tokens/token-hasher.interface';
import { AuthenticationResponse, LoginDto, UserProfileDto } from './dtos/auth.dtos';
import { AccountDisabledException, InvalidCredentialsException } from './exceptions/auth.exception';

/**
 * Use Case handling user authentication (Login).
 * Persists hashed refresh token records into a dedicated RefreshToken repository.
 */
export class LoginUseCase implements IUseCase<LoginDto, AuthenticationResponse> {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly refreshTokenRepository: IRefreshTokenRepository,
    private readonly passwordHasher: IPasswordHasher,
    private readonly tokenHasher: ITokenHasher,
    private readonly accessTokenService: IAccessTokenService,
    private readonly refreshTokenService: IRefreshTokenService,
    private readonly clock: IClock,
    private readonly logger?: ILoggerPort,
  ) {}

  async execute(request: LoginDto): Promise<AuthenticationResponse> {
    if (!request || !request.email || !request.password) {
      throw new InvalidCredentialsException('Email and password are required.');
    }

    const normalizedEmail = request.email.trim().toLowerCase();
    const user = await this.userRepository.findByEmail(normalizedEmail);

    if (!user) {
      this.logger?.warn(`Login failed: user not found (${normalizedEmail})`, 'LoginUseCase');
      throw new InvalidCredentialsException();
    }

    if (!user.isActive()) {
      this.logger?.warn(
        `Login rejected: user status is ${user.status} (${normalizedEmail})`,
        'LoginUseCase',
      );
      throw new AccountDisabledException();
    }

    const isPasswordValid = await this.passwordHasher.verify(request.password, user.passwordHash);
    if (!isPasswordValid) {
      this.logger?.warn(`Login failed: invalid password (${normalizedEmail})`, 'LoginUseCase');
      throw new InvalidCredentialsException();
    }

    const accessToken = await this.accessTokenService.generateToken({
      userId: user.id,
      email: user.email,
      roles: user.roles,
      permissions: user.permissions,
      tokenVersion: user.tokenVersion,
      tenantId: user.tenantId,
    });

    const refreshTokenResult = await this.refreshTokenService.generateRefreshToken({
      userId: user.id,
      tokenVersion: user.tokenVersion,
      tenantId: user.tenantId,
    });

    const hashedToken = this.tokenHasher.hashToken(refreshTokenResult.token);
    const expiresAt = new Date(this.clock.now().getTime() + 7 * 24 * 60 * 60 * 1000);

    const refreshTokenEntity = new RefreshToken({
      id: randomUUID(),
      tokenHash: hashedToken,
      familyId: refreshTokenResult.familyId,
      userId: user.id,
      isRevoked: false,
      expiresAt,
    });

    await this.refreshTokenRepository.save(refreshTokenEntity);

    this.logger?.log(`User authenticated successfully (${user.id})`, 'LoginUseCase');

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
      accessToken,
      refreshToken: refreshTokenResult.token,
      tokenType: 'Bearer',
      expiresIn: 900,
      user: userProfile,
    };
  }
}
