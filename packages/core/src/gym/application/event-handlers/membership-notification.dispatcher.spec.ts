import { MembershipNotificationDispatcher } from './membership-notification.dispatcher';
import { MembershipExpiredEvent } from '../../domain/events/membership-expired.event';
import { MembershipRenewedEvent } from '../../domain/events/membership-renewed.event';
import { GymLoggerPort } from '../ports/gym-logger.port';

describe('MembershipNotificationDispatcher (Phase 5.4-F)', () => {
  let logger: jest.Mocked<GymLoggerPort>;
  let dispatcher: MembershipNotificationDispatcher;

  beforeEach(() => {
    logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    dispatcher = new MembershipNotificationDispatcher(logger);
  });

  describe('1. MembershipExpired Event Handling', () => {
    it('should create notification intent upon receiving MembershipExpiredEvent', async () => {
      const expiredAt = new Date('2026-08-18T10:00:00.000Z');
      const event = new MembershipExpiredEvent('mem_001', 'client_001', 'plan_std', 2, expiredAt);

      await dispatcher.handleMembershipExpired(event);

      const intents = dispatcher.getDispatchedIntents();
      expect(intents).toHaveLength(1);
      expect(intents[0]?.recipientClientId).toBe('client_001');
      expect(intents[0]?.type).toBe('MEMBERSHIP_EXPIRED');
      expect(intents[0]?.membershipId).toBe('mem_001');
      expect(intents[0]?.dispatchedAt).toBe(expiredAt.toISOString());

      expect(logger.info).toHaveBeenCalledWith(
        'Dispatched membership expired operational notification intent',
        expect.objectContaining({
          membershipId: 'mem_001',
          clientId: 'client_001',
          eventId: event.eventId,
        }),
      );
    });

    it('should ignore duplicate events idempotently', async () => {
      const event = new MembershipExpiredEvent(
        'mem_001',
        'client_001',
        'plan_std',
        2,
        new Date('2026-08-18T10:00:00.000Z'),
      );

      await dispatcher.handleMembershipExpired(event);
      await dispatcher.handleMembershipExpired(event);

      expect(dispatcher.getDispatchedIntents()).toHaveLength(1);
      expect(logger.debug).toHaveBeenCalledWith(
        'Skipping duplicate MembershipExpiredEvent notification',
        expect.objectContaining({ eventId: event.eventId }),
      );
    });
  });

  describe('2. MembershipRenewed Event Handling', () => {
    it('should create notification intent upon receiving MembershipRenewedEvent', async () => {
      const renewedAt = new Date('2026-08-18T10:00:00.000Z');
      const newStartDate = new Date('2026-08-18T00:00:00.000Z');
      const newEndDate = new Date('2026-09-18T00:00:00.000Z');
      const event = new MembershipRenewedEvent(
        'mem_002',
        'client_002',
        'plan_std',
        newStartDate,
        newEndDate,
        2,
        renewedAt,
      );

      await dispatcher.handleMembershipRenewed(event);

      const intents = dispatcher.getDispatchedIntents();
      expect(intents).toHaveLength(1);
      expect(intents[0]?.recipientClientId).toBe('client_002');
      expect(intents[0]?.type).toBe('MEMBERSHIP_RENEWED');
      expect(intents[0]?.membershipId).toBe('mem_002');

      expect(logger.info).toHaveBeenCalledWith(
        'Dispatched membership renewed operational notification intent',
        expect.objectContaining({
          membershipId: 'mem_002',
          clientId: 'client_002',
          eventId: event.eventId,
        }),
      );
    });

    it('should ignore duplicate renewal events idempotently', async () => {
      const event = new MembershipRenewedEvent(
        'mem_002',
        'client_002',
        'plan_std',
        new Date('2026-08-18T00:00:00.000Z'),
        new Date('2026-09-18T00:00:00.000Z'),
        2,
        new Date('2026-08-18T10:00:00.000Z'),
      );

      await dispatcher.handleMembershipRenewed(event);
      await dispatcher.handleMembershipRenewed(event);

      expect(dispatcher.getDispatchedIntents()).toHaveLength(1);
    });
  });
});
