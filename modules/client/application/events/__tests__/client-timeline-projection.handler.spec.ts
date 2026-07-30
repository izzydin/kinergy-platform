import {
  ClientArchivedEvent,
  ClientCreatedEvent,
  ClientRestoredEvent,
  ClientUpdatedEvent,
  IdentityLinkedEvent,
} from '../../../domain/events';
import { ClientTimelineRepository } from '../../../domain/repositories/client-timeline.repository';
import { ClientTimelineProjectionHandler } from '../client-timeline-projection.handler';

describe('ClientTimelineProjectionHandler Unit Tests', () => {
  let handler: ClientTimelineProjectionHandler;
  let mockTimelineRepository: jest.Mocked<ClientTimelineRepository>;

  beforeEach(() => {
    mockTimelineRepository = {
      save: jest.fn().mockResolvedValue(undefined),
      findByClientId: jest.fn(),
    };

    handler = new ClientTimelineProjectionHandler(mockTimelineRepository);
  });

  it('should project ClientCreatedEvent to ClientTimelineEntry with sourceModule CLIENT', async () => {
    const event = new ClientCreatedEvent(
      'client-123',
      'CLI-2026-00001',
      'test@example.com',
      '+14155550000',
    );

    await handler.handle(event);

    expect(mockTimelineRepository.save).toHaveBeenCalledTimes(1);
    const entry = mockTimelineRepository.save.mock.calls[0]![0];
    expect(entry.clientId).toBe('client-123');
    expect(entry.sourceModule).toBe('CLIENT');
    expect(entry.eventType).toBe('CLIENT_CREATED');
    expect(entry.summary).toBe('Client account registered');
    expect(entry.metadata).toEqual({
      referenceNumber: 'CLI-2026-00001',
      email: 'test@example.com',
      phone: '+14155550000',
    });
  });

  it('should project ClientUpdatedEvent to ClientTimelineEntry with updated fields', async () => {
    const event = new ClientUpdatedEvent('client-123', ['name', 'phone']);

    await handler.handle(event);

    expect(mockTimelineRepository.save).toHaveBeenCalledTimes(1);
    const entry = mockTimelineRepository.save.mock.calls[0]![0];
    expect(entry.clientId).toBe('client-123');
    expect(entry.eventType).toBe('CLIENT_UPDATED');
    expect(entry.metadata).toEqual({ updatedFields: ['name', 'phone'] });
  });

  it('should project IdentityLinkedEvent with sourceModule IDENTITY', async () => {
    const event = new IdentityLinkedEvent('client-123', 'auth0|user123');

    await handler.handle(event);

    expect(mockTimelineRepository.save).toHaveBeenCalledTimes(1);
    const entry = mockTimelineRepository.save.mock.calls[0]![0];
    expect(entry.sourceModule).toBe('IDENTITY');
    expect(entry.eventType).toBe('IDENTITY_LINKED');
    expect(entry.metadata).toEqual({ identityId: 'auth0|user123' });
  });

  it('should project ClientArchivedEvent and ClientRestoredEvent', async () => {
    const archivedEvent = new ClientArchivedEvent('client-123');
    await handler.handle(archivedEvent);

    expect(mockTimelineRepository.save).toHaveBeenCalledTimes(1);
    expect(mockTimelineRepository.save.mock.calls[0]![0].eventType).toBe('CLIENT_ARCHIVED');

    const restoredEvent = new ClientRestoredEvent('client-123');
    await handler.handle(restoredEvent);

    expect(mockTimelineRepository.save).toHaveBeenCalledTimes(2);
    expect(mockTimelineRepository.save.mock.calls[1]![0].eventType).toBe('CLIENT_RESTORED');
  });

  it('should gracefully handle invalid or unhandled event payloads without throwing error', async () => {
    await expect(handler.handle(null)).resolves.not.toThrow();
    await expect(handler.handle({ random: 'object' })).resolves.not.toThrow();
    expect(mockTimelineRepository.save).not.toHaveBeenCalled();
  });
});
