import { Module } from '@nestjs/common';
import { LoggingModule } from '../logging';
import { AUDIT_SERVICE } from './audit-service.interface';
import { PlaceholderAuditService } from './placeholder-audit.service';

@Module({
  imports: [LoggingModule],
  providers: [
    PlaceholderAuditService,
    {
      provide: AUDIT_SERVICE,
      useExisting: PlaceholderAuditService,
    },
  ],
  exports: [PlaceholderAuditService, AUDIT_SERVICE],
})
export class AuditModule {}
