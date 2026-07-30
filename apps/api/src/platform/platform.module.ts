import { Global, Module } from '@nestjs/common';
import { ClientModule } from '@kinergy-platform/client-domain';
import { AuditModule } from './audit';
import { IdentityModule } from './identity';
import { LoggingModule } from './logging';
import { PrismaModule } from './persistence';
import { RateLimitingModule } from './rate-limiting';
import { WebSecurityModule } from './web-security';

@Global()
@Module({
  imports: [
    PrismaModule,
    IdentityModule,
    LoggingModule,
    AuditModule,
    RateLimitingModule,
    WebSecurityModule,
    ClientModule,
  ],
  exports: [
    PrismaModule,
    IdentityModule,
    LoggingModule,
    AuditModule,
    RateLimitingModule,
    WebSecurityModule,
    ClientModule,
  ],
})
export class PlatformModule {}
