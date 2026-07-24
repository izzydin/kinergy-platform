import { ILoggerPort } from '../logging';
import { PlaceholderAuditService } from './placeholder-audit.service';

describe('PlaceholderAuditService', () => {
  let service: PlaceholderAuditService;
  let mockLogger: jest.Mocked<ILoggerPort>;

  beforeEach(() => {
    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };
    service = new PlaceholderAuditService(mockLogger);
  });

  it('should format and log audit events', async () => {
    const auditEvent = {
      action: 'USER_CREATED',
      entityName: 'User',
      entityId: 'user-123',
      performedBy: 'admin-001',
      timestamp: new Date(),
    };

    await service.recordAudit(auditEvent);

    expect(mockLogger.log).toHaveBeenCalledWith(
      '[AUDIT] Action: USER_CREATED | Entity: User (user-123) | PerformedBy: admin-001',
      'AuditService',
    );
  });
});
