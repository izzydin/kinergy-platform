import { Inject, Injectable, Optional } from '@nestjs/common';
import { BaseSecurityEvent } from '../../identity/events/security-event.interface';
import { IAuditEvent } from '../audit-event.interface';
import {
  AuditEventCategory,
  AuditEventType,
  AuditOutcome,
  AuditSeverity,
} from '../audit-event-types';
import { AUDIT_EVENT_PUBLISHER, IAuditEventPublisher } from '../audit-event-publisher.interface';

/**
 * Reusable Hook Service that intercepts security domain events and normalizes them
 * into standardized IAuditEvent records without coupling identity domain logic to audit storage.
 */
@Injectable()
export class SecurityAuditHookService {
  constructor(
    @Inject(AUDIT_EVENT_PUBLISHER)
    @Optional()
    private readonly auditPublisher?: IAuditEventPublisher,
  ) {}

  /**
   * Security Event Hook. Maps a SecurityEvent into a normalized IAuditEvent and publishes it.
   */
  async handleSecurityEvent(event: BaseSecurityEvent): Promise<IAuditEvent | null> {
    if (!event) {
      return null;
    }

    const auditEvent = this.mapToAuditEvent(event);
    if (this.auditPublisher && auditEvent) {
      await this.auditPublisher.publish(auditEvent);
    }

    return auditEvent;
  }

  /**
   * Internal mapper translating domain SecurityEvents into normalized IAuditEvent records.
   */
  private mapToAuditEvent(event: BaseSecurityEvent): IAuditEvent {
    let category = AuditEventCategory.AUTHENTICATION;
    let auditType: AuditEventType | string = event.eventType;
    let severity = AuditSeverity.LOW;
    let outcome = AuditOutcome.SUCCESS;
    let reason: string | undefined = undefined;

    switch (event.eventType) {
      case 'LoginSucceeded':
        auditType = AuditEventType.LOGIN_SUCCEEDED;
        category = AuditEventCategory.AUTHENTICATION;
        severity = AuditSeverity.LOW;
        outcome = AuditOutcome.SUCCESS;
        break;

      case 'LoginFailed':
        auditType = AuditEventType.LOGIN_FAILED;
        category = AuditEventCategory.AUTHENTICATION;
        severity = AuditSeverity.MEDIUM;
        outcome = AuditOutcome.FAILURE;
        reason = (event as { reason?: string }).reason || 'Authentication failed';
        break;

      case 'LogoutSucceeded':
        auditType = AuditEventType.LOGOUT;
        category = AuditEventCategory.AUTHENTICATION;
        severity = AuditSeverity.LOW;
        outcome = AuditOutcome.SUCCESS;
        break;

      case 'RefreshTokenRotated':
        auditType = AuditEventType.TOKEN_REFRESHED;
        category = AuditEventCategory.AUTHENTICATION;
        severity = AuditSeverity.LOW;
        outcome = AuditOutcome.SUCCESS;
        break;

      case 'RefreshTokenReplayDetected':
        auditType = AuditEventType.SECURITY_ALERT;
        category = AuditEventCategory.SYSTEM_SECURITY;
        severity = AuditSeverity.CRITICAL;
        outcome = AuditOutcome.DENIED;
        reason = 'Refresh token replay attempt detected';
        break;

      case 'PasswordChanged':
        auditType = AuditEventType.PASSWORD_CHANGED;
        category = AuditEventCategory.IDENTITY_ADMINISTRATION;
        severity = AuditSeverity.MEDIUM;
        outcome = AuditOutcome.SUCCESS;
        break;

      case 'PasswordResetByAdmin':
        auditType = AuditEventType.PASSWORD_RESET;
        category = AuditEventCategory.IDENTITY_ADMINISTRATION;
        severity = AuditSeverity.HIGH;
        outcome = AuditOutcome.SUCCESS;
        break;
    }

    return {
      eventId: event.eventId,
      eventType: auditType,
      category,
      timestamp: event.timestamp || new Date(),
      actor: {
        userId: event.userId || undefined,
        email: event.email || undefined,
        tenantId: event.tenantId,
      },
      target: {
        type: 'User',
        id: event.userId || event.email || 'unknown',
      },
      outcome,
      severity,
      tenantId: event.tenantId,
      metadata: {
        clientIp: event.ipAddress || undefined,
        userAgent: event.userAgent || undefined,
        reason,
        custom: event.metadata,
      },
    };
  }
}
