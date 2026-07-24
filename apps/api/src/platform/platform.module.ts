import { Global, Module } from '@nestjs/common';
import { AuditModule } from './audit';
import { IdentityModule } from './identity';
import { LoggingModule } from './logging';
import { PrismaModule } from './persistence';

@Global()
@Module({
  imports: [PrismaModule, IdentityModule, LoggingModule, AuditModule],
  exports: [PrismaModule, IdentityModule, LoggingModule, AuditModule],
})
export class PlatformModule {}
