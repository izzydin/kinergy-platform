export interface IAuditLogEvent {
  action: string;
  entityName: string;
  entityId: string;
  performedBy: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}
