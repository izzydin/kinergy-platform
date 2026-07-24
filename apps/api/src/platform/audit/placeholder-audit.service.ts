import { Inject, Injectable } from '@nestjs/common';
import { ILoggerPort, LOGGER_PORT } from '../logging';
import { IAuditLogEvent } from './audit-log.interface';
import { IAuditService } from './audit-service.interface';

@Injectable()
export class PlaceholderAuditService implements IAuditService {
  constructor(@Inject(LOGGER_PORT) private readonly logger: ILoggerPort) {}

  async recordAudit(event: IAuditLogEvent): Promise<void> {
    this.logger.log(
      `[AUDIT] Action: ${event.action} | Entity: ${event.entityName} (${event.entityId}) | PerformedBy: ${event.performedBy}`,
      'AuditService',
    );
  }
}
