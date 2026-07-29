import { LoggerAuditEventPublisher } from '../logger-audit-event-publisher';
import { IAuditEvent } from '../audit-event.interface';
import {
  AuditEventCategory,
  AuditEventType,
  AuditOutcome,
  AuditSeverity,
} from '../audit-event-types';
import { ILoggerPort } from '../../logging';

describe('LoggerAuditEventPublisher', () => {
  let publisher: LoggerAuditEventPublisher;
  let mockLogger: jest.Mocked<ILoggerPort>;

  const sampleEvent: IAuditEvent = {
    eventId: 'evt_12345',
    eventType: AuditEventType.USER_CREATED,
    category: AuditEventCategory.IDENTITY_ADMINISTRATION,
    timestamp: new Date('2026-07-29T12:00:00.000Z'),
    actor: {
      userId: 'usr_admin',
      email: 'admin@kinergy.com',
      roles: ['ADMIN'],
    },
    target: {
      type: 'User',
      id: 'usr_new_999',
      name: 'Jane Doe',
    },
    outcome: AuditOutcome.SUCCESS,
    severity: AuditSeverity.LOW,
    tenantId: 'tenant_alpha',
    metadata: {
      reason: 'User onboarded via admin portal',
    },
  };

  beforeEach(() => {
    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    publisher = new LoggerAuditEventPublisher(mockLogger);
  });

  it('should publish a single audit event with LOW severity via logger.log', async () => {
    await publisher.publish(sampleEvent);

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.stringContaining('[AUDIT RECORD] IDENTITY_ADMINISTRATION:USER_CREATED'),
      'AuditEventPublisher',
    );
  });

  it('should publish a MEDIUM severity audit event via logger.warn', async () => {
    const warnEvent: IAuditEvent = {
      ...sampleEvent,
      severity: AuditSeverity.MEDIUM,
      eventType: AuditEventType.LOGIN_FAILED,
    };

    await publisher.publish(warnEvent);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('[AUDIT RECORD] IDENTITY_ADMINISTRATION:LOGIN_FAILED'),
      'AuditEventPublisher',
    );
  });

  it('should publish a HIGH / CRITICAL severity audit event via logger.error', async () => {
    const criticalEvent: IAuditEvent = {
      ...sampleEvent,
      severity: AuditSeverity.CRITICAL,
      eventType: AuditEventType.SECURITY_ALERT,
      category: AuditEventCategory.SYSTEM_SECURITY,
    };

    await publisher.publish(criticalEvent);

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('[AUDIT RECORD] SYSTEM_SECURITY:SECURITY_ALERT'),
      undefined,
      'AuditEventPublisher',
    );
  });

  it('should publish batch audit events', async () => {
    const events: IAuditEvent[] = [
      sampleEvent,
      { ...sampleEvent, eventId: 'evt_67890', eventType: AuditEventType.ROLE_ASSIGNED },
    ];

    await publisher.publishBatch(events);

    expect(mockLogger.log).toHaveBeenCalledTimes(2);
  });

  it('should safely handle null or empty event publishing', async () => {
    await publisher.publish(null as unknown as IAuditEvent);
    await publisher.publishBatch([]);

    expect(mockLogger.log).not.toHaveBeenCalled();
    expect(mockLogger.warn).not.toHaveBeenCalled();
    expect(mockLogger.error).not.toHaveBeenCalled();
  });
});
