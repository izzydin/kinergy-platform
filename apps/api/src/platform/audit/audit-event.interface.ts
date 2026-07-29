import {
  AuditEventCategory,
  AuditEventType,
  AuditOutcome,
  AuditSeverity,
} from './audit-event-types';
import { IAuditEventMetadata } from './audit-event-metadata.interface';

/**
 * Identity of the actor (user, system, or service principal) performing an audited operation.
 */
export interface IAuditEventActor {
  userId?: string;
  email?: string;
  roles?: string[];
  tenantId?: string | null;
}

/**
 * Entity or resource targeted by the audited operation.
 */
export interface IAuditEventTarget {
  type: string; // e.g. 'User', 'Role', 'Password', 'Configuration'
  id: string; // Resource identifier
  name?: string;
}

/**
 * Fundamental domain contract for structured Audit Events across the platform.
 * Follows Clean Architecture and DDD principles, decoupling business logic from storage adapters.
 */
export interface IAuditEvent {
  eventId: string;
  eventType: AuditEventType | string;
  category: AuditEventCategory;
  timestamp: Date;
  actor: IAuditEventActor;
  target: IAuditEventTarget;
  outcome: AuditOutcome;
  severity: AuditSeverity;
  tenantId?: string | null;
  metadata?: IAuditEventMetadata;
}
