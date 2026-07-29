import { Global, Module } from '@nestjs/common';
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
  ],
  exports: [
    PrismaModule,
    IdentityModule,
    LoggingModule,
    AuditModule,
    RateLimitingModule,
    WebSecurityModule,
  ],
})
export class PlatformModule {}
