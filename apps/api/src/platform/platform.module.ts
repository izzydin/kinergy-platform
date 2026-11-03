import { Global, Module } from '@nestjs/common';
import { ClientModule } from '@kinergy-platform/client-domain';
import { AuditModule } from './audit';
import { IdentityModule } from './identity';
import { LoggingModule } from './logging';
import { PrismaModule } from './persistence';
import { RateLimitingModule } from './rate-limiting';
import { WebSecurityModule } from './web-security';
import { StorageModule } from './storage';

@Global()
@Module({
  imports: [
    PrismaModule,
    IdentityModule,
    LoggingModule,
    AuditModule,
    RateLimitingModule,
    WebSecurityModule,
    StorageModule.register(),
    ClientModule,
  ],
  exports: [
    PrismaModule,
    IdentityModule,
    LoggingModule,
    AuditModule,
    RateLimitingModule,
    WebSecurityModule,
    StorageModule,
    ClientModule,
  ],
})
export class PlatformModule {}
