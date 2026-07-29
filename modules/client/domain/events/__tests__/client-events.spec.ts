import {
  ClientArchivedEvent,
  ClientCreatedEvent,
  ClientRestoredEvent,
  IdentityLinkedEvent,
} from '../index';

describe('Client Domain Events Unit Tests', () => {
  it('should instantiate ClientCreatedEvent with correct payload and aggregate ID', () => {
    const now = new Date();
    const event = new ClientCreatedEvent(
      'cli_123',
      'CLI-2026-00001',
      'client@kinergy.com',
      '+59170000000',
      now,
    );

    expect(event.clientId).toBe('cli_123');
    expect(event.referenceNumber).toBe('CLI-2026-00001');
    expect(event.email).toBe('client@kinergy.com');
    expect(event.phone).toBe('+59170000000');
    expect(event.occurredAt).toEqual(now);
    expect(event.dateTimeOccurred).toEqual(now);
    expect(event.getAggregateId()).toBe('cli_123');
  });

  it('should instantiate IdentityLinkedEvent with correct payload', () => {
    const now = new Date();
    const event = new IdentityLinkedEvent('cli_123', 'usr_auth_99', now);

    expect(event.clientId).toBe('cli_123');
    expect(event.identityId).toBe('usr_auth_99');
    expect(event.occurredAt).toEqual(now);
    expect(event.getAggregateId()).toBe('cli_123');
  });

  it('should instantiate ClientArchivedEvent with correct payload', () => {
    const now = new Date();
    const event = new ClientArchivedEvent('cli_123', now);

    expect(event.clientId).toBe('cli_123');
    expect(event.occurredAt).toEqual(now);
    expect(event.getAggregateId()).toBe('cli_123');
  });

  it('should instantiate ClientRestoredEvent with correct payload', () => {
    const now = new Date();
    const event = new ClientRestoredEvent('cli_123', now);

    expect(event.clientId).toBe('cli_123');
    expect(event.occurredAt).toEqual(now);
    expect(event.getAggregateId()).toBe('cli_123');
  });
});
