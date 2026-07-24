import { IAuditLogEvent } from './audit-log.interface';

export interface IAuditService {
  recordAudit(event: IAuditLogEvent): Promise<void>;
}
