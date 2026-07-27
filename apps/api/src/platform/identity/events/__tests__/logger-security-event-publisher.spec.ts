import { LoggerSecurityEventPublisher } from '../logger-security-event-publisher';
import { LoginSucceededEvent, RefreshTokenReplayDetectedEvent } from '../security-event.interface';

describe('LoggerSecurityEventPublisher', () => {
  let publisher: LoggerSecurityEventPublisher;

  beforeEach(() => {
    publisher = new LoggerSecurityEventPublisher();
  });

  it('should format and publish successful security events cleanly', async () => {
    const event: LoginSucceededEvent = {
      eventId: 'evt_123',
      eventType: 'LoginSucceeded',
      timestamp: new Date('2026-07-27T12:00:00.000Z'),
      userId: 'usr_123',
      email: 'user@example.com',
      tenantId: 'tenant_1',
    };

    await expect(publisher.publish(event)).resolves.not.toThrow();
  });

  it('should format and publish security warning events cleanly', async () => {
    const event: RefreshTokenReplayDetectedEvent = {
      eventId: 'evt_alert_1',
      eventType: 'RefreshTokenReplayDetected',
      timestamp: new Date('2026-07-27T12:00:00.000Z'),
      userId: 'usr_123',
      familyId: 'fam_123',
    };

    await expect(publisher.publish(event)).resolves.not.toThrow();
  });
});
