import { Module } from '@nestjs/common';
import { LoggingModule } from '../logging';
import { AUDIT_EVENT_PUBLISHER } from './audit-event-publisher.interface';
import { AUDIT_SERVICE } from './audit-service.interface';
import { LoggerAuditEventPublisher } from './logger-audit-event-publisher';
import { PlaceholderAuditService } from './placeholder-audit.service';
import { SecurityAuditHookService } from './hooks/security-audit-hook.service';

@Module({
  imports: [LoggingModule],
  providers: [
    PlaceholderAuditService,
    LoggerAuditEventPublisher,
    SecurityAuditHookService,
    {
      provide: AUDIT_SERVICE,
      useExisting: PlaceholderAuditService,
    },
    {
      provide: AUDIT_EVENT_PUBLISHER,
      useClass: LoggerAuditEventPublisher,
    },
  ],
  exports: [
    PlaceholderAuditService,
    LoggerAuditEventPublisher,
    SecurityAuditHookService,
    AUDIT_SERVICE,
    AUDIT_EVENT_PUBLISHER,
  ],
})
export class AuditModule {}
