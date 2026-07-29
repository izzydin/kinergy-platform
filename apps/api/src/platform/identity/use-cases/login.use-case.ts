import { randomUUID } from 'crypto';
import { IUseCase } from '../../../shared/common/use-case.interface';
import { IClock } from '../../../shared/common/clock.interface';
import { ILoggerPort } from '../../logging/logger-port.interface';
import { RefreshToken, IRefreshTokenRepository, IUserRepository } from '../domain';
import { ISecurityEventPublisher } from '../events/security-event-publisher.interface';
import { IPasswordHasher } from '../password/password-hasher.interface';
import { IAccessTokenService } from '../tokens/access-token.service';
import { IRefreshTokenService } from '../tokens/refresh-token.service';
import { ITokenConfiguration } from '../tokens/token-configuration.interface';
import { ITokenHasher } from '../tokens/token-hasher.interface';
import { AuthenticationResponse, LoginDto, UserProfileDto } from './dtos/auth.dtos';
import { InvalidCredentialsException } from './exceptions/auth.exception';

/**
 * Valid dummy Argon2id hash used to perform constant-time verification on non-existent users.
 * Mitigates latency-based timing attacks (user enumeration side channels).
 */
const DUMMY_ARGON2_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$c29tZWhhc2h2YWx1ZXdhc2Rmc2FkZg';

/**
 * Use Case handling user authentication (Login).
 * Prevents information disclosure by returning generic authentication responses across all failure scenarios
 * while preserving detailed internal audit event telemetry.
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
    private readonly tokenConfiguration: ITokenConfiguration,
    private readonly eventPublisher?: ISecurityEventPublisher,
    private readonly logger?: ILoggerPort,
  ) {}

  async execute(request: LoginDto): Promise<AuthenticationResponse> {
    if (!request || !request.email || !request.password) {
      throw new InvalidCredentialsException('Email and password are required.');
    }

    const normalizedEmail = request.email.trim().toLowerCase();
    const user = await this.userRepository.findByEmail(normalizedEmail);

    if (!user) {
      // Execute dummy password verification to neutralize response latency timing attacks
      await this.passwordHasher.verify(request.password, DUMMY_ARGON2_HASH);

      this.logger?.warn(`Login failed: user not found (${normalizedEmail})`, 'LoginUseCase');
      await this.eventPublisher?.publish({
        eventId: randomUUID(),
        eventType: 'LoginFailed',
        timestamp: this.clock.now(),
        email: normalizedEmail,
        reason: 'User not found',
      });
      throw new InvalidCredentialsException();
    }

    if (!user.isActive()) {
      this.logger?.warn(
        `Login rejected: user status is ${user.status} (${normalizedEmail})`,
        'LoginUseCase',
      );
      await this.eventPublisher?.publish({
        eventId: randomUUID(),
        eventType: 'LoginFailed',
        timestamp: this.clock.now(),
        userId: user.id,
        email: normalizedEmail,
        tenantId: user.tenantId,
        reason: `Account status disabled (${user.status})`,
      });
      // Throw generic InvalidCredentialsException to prevent account status enumeration
      throw new InvalidCredentialsException();
    }

    const isPasswordValid = await this.passwordHasher.verify(request.password, user.passwordHash);
    if (!isPasswordValid) {
      this.logger?.warn(`Login failed: invalid password (${normalizedEmail})`, 'LoginUseCase');
      await this.eventPublisher?.publish({
        eventId: randomUUID(),
        eventType: 'LoginFailed',
        timestamp: this.clock.now(),
        userId: user.id,
        email: normalizedEmail,
        tenantId: user.tenantId,
        reason: 'Invalid password',
      });
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
    const refreshTokenTtlMs = this.tokenConfiguration.getRefreshTokenTtlMs();
    const expiresAt = new Date(this.clock.now().getTime() + refreshTokenTtlMs);

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

    await this.eventPublisher?.publish({
      eventId: randomUUID(),
      eventType: 'LoginSucceeded',
      timestamp: this.clock.now(),
      userId: user.id,
      email: user.email,
      tenantId: user.tenantId,
    });

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
      expiresIn: this.tokenConfiguration.getAccessTokenTtlSeconds(),
      user: userProfile,
    };
  }
}
