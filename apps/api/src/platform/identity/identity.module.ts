import { Module } from '@nestjs/common';
import { IDENTITY_CONTEXT } from './identity-context.interface';
import { PlaceholderIdentityContextService } from './placeholder-identity-context.service';

@Module({
  providers: [
    PlaceholderIdentityContextService,
    {
      provide: IDENTITY_CONTEXT,
      useExisting: PlaceholderIdentityContextService,
    },
  ],
  exports: [PlaceholderIdentityContextService, IDENTITY_CONTEXT],
})
export class IdentityModule {}
