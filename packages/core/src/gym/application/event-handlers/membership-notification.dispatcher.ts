import { MembershipExpiredEvent } from '../../domain/events/membership-expired.event';
import { MembershipRenewedEvent } from '../../domain/events/membership-renewed.event';
import { GymLoggerPort } from '../ports/gym-logger.port';

export interface NotificationIntent {
  readonly notificationId: string;
  readonly recipientClientId: string;
  readonly type: 'MEMBERSHIP_EXPIRED' | 'MEMBERSHIP_RENEWED';
  readonly membershipId: string;
  readonly dispatchedAt: string;
}

/**
 * Event consumer listening to Gym lifecycle events to dispatch internal/operational notifications.
 * Decouples domain aggregate from external communication channels (email/WhatsApp/SMS deferred).
 */
export class MembershipNotificationDispatcher {
  private readonly dispatchedEventIds = new Set<string>();
  private readonly intents: NotificationIntent[] = [];

  constructor(private readonly logger?: GymLoggerPort) {}

  public async handleMembershipExpired(event: MembershipExpiredEvent): Promise<void> {
    if (this.dispatchedEventIds.has(event.eventId)) {
      this.logger?.debug('Skipping duplicate MembershipExpiredEvent notification', {
        eventId: event.eventId,
      });
      return;
    }

    this.dispatchedEventIds.add(event.eventId);

    const intent: NotificationIntent = {
      notificationId: `notif_exp_${event.payload.membershipId}_${Date.now()}`,
      recipientClientId: event.payload.clientId,
      type: 'MEMBERSHIP_EXPIRED',
      membershipId: event.payload.membershipId,
      dispatchedAt: event.payload.expiredAt.toISOString(),
    };

    this.intents.push(intent);

    this.logger?.info('Dispatched membership expired operational notification intent', {
      membershipId: event.payload.membershipId,
      clientId: event.payload.clientId,
      eventId: event.eventId,
    });
  }

  public async handleMembershipRenewed(event: MembershipRenewedEvent): Promise<void> {
    if (this.dispatchedEventIds.has(event.eventId)) {
      this.logger?.debug('Skipping duplicate MembershipRenewedEvent notification', {
        eventId: event.eventId,
      });
      return;
    }

    this.dispatchedEventIds.add(event.eventId);

    const intent: NotificationIntent = {
      notificationId: `notif_ren_${event.payload.membershipId}_${Date.now()}`,
      recipientClientId: event.payload.clientId,
      type: 'MEMBERSHIP_RENEWED',
      membershipId: event.payload.membershipId,
      dispatchedAt: event.payload.renewedAt.toISOString(),
    };

    this.intents.push(intent);

    this.logger?.info('Dispatched membership renewed operational notification intent', {
      membershipId: event.payload.membershipId,
      clientId: event.payload.clientId,
      eventId: event.eventId,
    });
  }

  public getDispatchedIntents(): ReadonlyArray<NotificationIntent> {
    return [...this.intents];
  }
}
