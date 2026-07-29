import { IAuditEvent } from './audit-event.interface';

/**
 * Abstract Port Interface for Audit Event Publishing.
 * Decouples domain use cases and application services from underlying logging, messaging, or persistence adapters.
 */
export interface IAuditEventPublisher {
  /**
   * Publishes a single audit event asynchronously.
   */
  publish(event: IAuditEvent): Promise<void>;

  /**
   * Publishes a batch of audit events atomically or in bulk.
   */
  publishBatch(events: IAuditEvent[]): Promise<void>;
}

/**
 * NestJS Dependency Injection Token for IAuditEventPublisher bindings.
 */
export const AUDIT_EVENT_PUBLISHER = Symbol('IAuditEventPublisher');
