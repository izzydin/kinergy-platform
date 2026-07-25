import { Module } from '@nestjs/common';
import { IDENTITY_CONTEXT } from './identity-context.interface';
import { PlaceholderIdentityContextService } from './placeholder-identity-context.service';
import { Argon2PasswordHasher, PASSWORD_HASHER, PasswordPolicyService } from './password';

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
  ],
  exports: [
    PlaceholderIdentityContextService,
    IDENTITY_CONTEXT,
    Argon2PasswordHasher,
    PASSWORD_HASHER,
    PasswordPolicyService,
  ],
})
export class IdentityModule {}
