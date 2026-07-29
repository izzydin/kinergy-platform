import { SecurityAuditHookService } from '../hooks/security-audit-hook.service';
import { IAuditEventPublisher } from '../audit-event-publisher.interface';
import {
  AuditEventCategory,
  AuditEventType,
  AuditOutcome,
  AuditSeverity,
} from '../audit-event-types';
import { BaseSecurityEvent } from '../../identity/events/security-event.interface';

describe('SecurityAuditHookService', () => {
  let hookService: SecurityAuditHookService;
  let mockPublisher: jest.Mocked<IAuditEventPublisher>;

  beforeEach(() => {
    mockPublisher = {
      publish: jest.fn().mockResolvedValue(undefined),
      publishBatch: jest.fn().mockResolvedValue(undefined),
    };

    hookService = new SecurityAuditHookService(mockPublisher);
  });

  it('should map LoginSucceeded security event into normalized IAuditEvent and publish', async () => {
    const domainEvent: BaseSecurityEvent = {
      eventId: 'sec_evt_1',
      eventType: 'LoginSucceeded',
      timestamp: new Date('2026-07-29T12:00:00.000Z'),
      userId: 'usr_123',
      email: 'user@kinergy.com',
      tenantId: 'tenant_alpha',
      ipAddress: '192.168.1.1',
    };

    const auditEvent = await hookService.handleSecurityEvent(domainEvent);

    expect(auditEvent).not.toBeNull();
    expect(auditEvent?.eventType).toBe(AuditEventType.LOGIN_SUCCEEDED);
    expect(auditEvent?.category).toBe(AuditEventCategory.AUTHENTICATION);
    expect(auditEvent?.outcome).toBe(AuditOutcome.SUCCESS);
    expect(auditEvent?.severity).toBe(AuditSeverity.LOW);
    expect(mockPublisher.publish).toHaveBeenCalledWith(auditEvent);
  });

  it('should map LoginFailed security event into FAILURE outcome with MEDIUM severity', async () => {
    const domainEvent: BaseSecurityEvent = {
      eventId: 'sec_evt_2',
      eventType: 'LoginFailed',
      timestamp: new Date('2026-07-29T12:00:00.000Z'),
      email: 'faileduser@kinergy.com',
      metadata: { reason: 'Invalid password' },
    };

    const auditEvent = await hookService.handleSecurityEvent(domainEvent);

    expect(auditEvent?.eventType).toBe(AuditEventType.LOGIN_FAILED);
    expect(auditEvent?.outcome).toBe(AuditOutcome.FAILURE);
    expect(auditEvent?.severity).toBe(AuditSeverity.MEDIUM);
    expect(mockPublisher.publish).toHaveBeenCalledWith(auditEvent);
  });

  it('should map RefreshTokenReplayDetected into CRITICAL SECURITY_ALERT audit event', async () => {
    const domainEvent: BaseSecurityEvent = {
      eventId: 'sec_evt_3',
      eventType: 'RefreshTokenReplayDetected',
      timestamp: new Date('2026-07-29T12:00:00.000Z'),
      userId: 'usr_hacked',
      tenantId: 'tenant_alpha',
    };

    const auditEvent = await hookService.handleSecurityEvent(domainEvent);

    expect(auditEvent?.eventType).toBe(AuditEventType.SECURITY_ALERT);
    expect(auditEvent?.category).toBe(AuditEventCategory.SYSTEM_SECURITY);
    expect(auditEvent?.outcome).toBe(AuditOutcome.DENIED);
    expect(auditEvent?.severity).toBe(AuditSeverity.CRITICAL);
    expect(mockPublisher.publish).toHaveBeenCalledWith(auditEvent);
  });

  it('should return null for null input', async () => {
    const auditEvent = await hookService.handleSecurityEvent(null as unknown as BaseSecurityEvent);
    expect(auditEvent).toBeNull();
    expect(mockPublisher.publish).not.toHaveBeenCalled();
  });
});
