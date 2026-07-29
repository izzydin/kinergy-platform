/**
 * Structured change record representing a field state mutation.
 */
export interface AuditFieldChange {
  field: string;
  oldValue?: unknown;
  newValue?: unknown;
}

/**
 * Extensible, strongly-typed metadata schema attached to audit events.
 * Provides contextual diagnostic telemetry without coupling to transport or persistence layers.
 */
export interface IAuditEventMetadata {
  correlationId?: string;
  causationId?: string;
  resourcePath?: string;
  clientIp?: string;
  userAgent?: string;
  reason?: string;
  changes?: AuditFieldChange[];
  custom?: Record<string, unknown>;
}
