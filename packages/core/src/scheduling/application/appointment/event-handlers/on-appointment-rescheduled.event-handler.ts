import { EventHandler } from '../../shared/event-handler.interface';
import { AppointmentRescheduledEvent } from '../../../domain/events/appointment-rescheduled.event';

/**
 * Domain Event Subscriber processing AppointmentRescheduledEvent notifications.
 */
export class OnAppointmentRescheduledEventHandler implements EventHandler<AppointmentRescheduledEvent> {
  private readonly handledEvents: AppointmentRescheduledEvent[] = [];

  /** Handles appointment rescheduled side effects with failure isolation */
  public async handle(event: AppointmentRescheduledEvent): Promise<void> {
    try {
      this.handledEvents.push(event);
      // Placeholder side effect: Update bi-directional calendar projections & dispatch reschedule notices
    } catch {
      // Failure isolation: prevent secondary side-effect failures from disrupting primary unit of work
    }
  }

  /** Gets handled events history for testing/auditing */
  public getHandledEvents(): ReadonlyArray<AppointmentRescheduledEvent> {
    return Object.freeze([...this.handledEvents]);
  }
}
