import { Global, Module } from '@nestjs/common';
import { AuditModule } from './audit';
import { IdentityModule } from './identity';
import { LoggingModule } from './logging';
import { PrismaModule } from './persistence';
import { RateLimitingModule } from './rate-limiting';

@Global()
@Module({
  imports: [PrismaModule, IdentityModule, LoggingModule, AuditModule, RateLimitingModule],
  exports: [PrismaModule, IdentityModule, LoggingModule, AuditModule, RateLimitingModule],
})
export class PlatformModule {}
