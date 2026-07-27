import { Module } from '@nestjs/common';
import { IDENTITY_CONTEXT } from './identity-context.interface';
import { PlaceholderIdentityContextService } from './placeholder-identity-context.service';
import { Argon2PasswordHasher, PASSWORD_HASHER, PasswordPolicyService } from './password';
import {
  ACCESS_TOKEN_SERVICE,
  AccessTokenService,
  ConfigSecretProvider,
  ConfigTokenConfiguration,
  JwtTokenFactory,
  REFRESH_TOKEN_SERVICE,
  RefreshTokenService,
  SECRET_PROVIDER,
  TOKEN_CONFIGURATION,
  TOKEN_FACTORY,
  TOKEN_HASHER,
  Sha256TokenHasher,
} from './tokens';
import { REFRESH_TOKEN_REPOSITORY, USER_REPOSITORY } from './domain';
import { PrismaRefreshTokenRepository, PrismaUserRepository } from '../persistence/prisma';
import { CLOCK, SystemClock } from '../../shared/common/clock.interface';

@Module({
  providers: [
    PlaceholderIdentityContextService,
    {
      provide: IDENTITY_CONTEXT,
      useExisting: PlaceholderIdentityContextService,
    },
    Argon2PasswordHasher,
    {
      provide: PASSWORD_HASHER,
      useClass: Argon2PasswordHasher,
    },
    PasswordPolicyService,
    ConfigSecretProvider,
    {
      provide: SECRET_PROVIDER,
      useClass: ConfigSecretProvider,
    },
    ConfigTokenConfiguration,
    {
      provide: TOKEN_CONFIGURATION,
      useClass: ConfigTokenConfiguration,
    },
    JwtTokenFactory,
    {
      provide: TOKEN_FACTORY,
      useClass: JwtTokenFactory,
    },
    AccessTokenService,
    {
      provide: ACCESS_TOKEN_SERVICE,
      useClass: AccessTokenService,
    },
    RefreshTokenService,
    {
      provide: REFRESH_TOKEN_SERVICE,
      useClass: RefreshTokenService,
    },
    Sha256TokenHasher,
    {
      provide: TOKEN_HASHER,
      useClass: Sha256TokenHasher,
    },
    PrismaUserRepository,
    {
      provide: USER_REPOSITORY,
      useClass: PrismaUserRepository,
    },
    PrismaRefreshTokenRepository,
    {
      provide: REFRESH_TOKEN_REPOSITORY,
      useClass: PrismaRefreshTokenRepository,
    },
    SystemClock,
    {
      provide: CLOCK,
      useClass: SystemClock,
    },
  ],
  exports: [
    PlaceholderIdentityContextService,
    IDENTITY_CONTEXT,
    Argon2PasswordHasher,
    PASSWORD_HASHER,
    PasswordPolicyService,
    ConfigSecretProvider,
    SECRET_PROVIDER,
    ConfigTokenConfiguration,
    TOKEN_CONFIGURATION,
    JwtTokenFactory,
    TOKEN_FACTORY,
    AccessTokenService,
    ACCESS_TOKEN_SERVICE,
    RefreshTokenService,
    REFRESH_TOKEN_SERVICE,
    Sha256TokenHasher,
    TOKEN_HASHER,
    PrismaUserRepository,
    USER_REPOSITORY,
    PrismaRefreshTokenRepository,
    REFRESH_TOKEN_REPOSITORY,
    SystemClock,
    CLOCK,
  ],
})
export class IdentityModule {}
