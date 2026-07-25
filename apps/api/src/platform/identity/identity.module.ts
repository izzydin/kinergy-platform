import { Module } from '@nestjs/common';
import { IDENTITY_CONTEXT } from './identity-context.interface';
import { PlaceholderIdentityContextService } from './placeholder-identity-context.service';
import { Argon2PasswordHasher, PASSWORD_HASHER, PasswordPolicyService } from './password';
import {
  ACCESS_TOKEN_SERVICE,
  AccessTokenService,
  ConfigSecretProvider,
  JwtTokenFactory,
  REFRESH_TOKEN_SERVICE,
  RefreshTokenService,
  SECRET_PROVIDER,
  TOKEN_FACTORY,
} from './tokens';

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
  ],
  exports: [
    PlaceholderIdentityContextService,
    IDENTITY_CONTEXT,
    Argon2PasswordHasher,
    PASSWORD_HASHER,
    PasswordPolicyService,
    ConfigSecretProvider,
    SECRET_PROVIDER,
    JwtTokenFactory,
    TOKEN_FACTORY,
    AccessTokenService,
    ACCESS_TOKEN_SERVICE,
    RefreshTokenService,
    REFRESH_TOKEN_SERVICE,
  ],
})
export class IdentityModule {}
