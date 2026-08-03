import { EventHandler } from '../../shared/event-handler.interface';
import { AppointmentCancelledEvent } from '../../../domain/events/appointment-cancelled.event';

/**
 * Domain Event Subscriber processing AppointmentCancelledEvent notifications.
 */
export class OnAppointmentCancelledEventHandler implements EventHandler<AppointmentCancelledEvent> {
  private readonly handledEvents: AppointmentCancelledEvent[] = [];

  /** Handles appointment cancelled side effects with failure isolation */
  public async handle(event: AppointmentCancelledEvent): Promise<void> {
    try {
      this.handledEvents.push(event);
      // Placeholder side effect: Release room holds & evaluate cancellation fee billing rules
    } catch {
      // Failure isolation: prevent secondary side-effect failures from disrupting primary unit of work
    }
  }

  /** Gets handled events history for testing/auditing */
  public getHandledEvents(): ReadonlyArray<AppointmentCancelledEvent> {
    return Object.freeze([...this.handledEvents]);
  }
}
