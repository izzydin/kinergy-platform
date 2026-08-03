import { EventHandler } from '../../shared/event-handler.interface';
import { AppointmentCompletedEvent } from '../../../domain/events/appointment-completed.event';

/**
 * Domain Event Subscriber processing AppointmentCompletedEvent notifications.
 */
export class OnAppointmentCompletedEventHandler implements EventHandler<AppointmentCompletedEvent> {
  private readonly handledEvents: AppointmentCompletedEvent[] = [];

  /** Handles appointment completed side effects with failure isolation */
  public async handle(event: AppointmentCompletedEvent): Promise<void> {
    try {
      this.handledEvents.push(event);
      // Placeholder side effect: Trigger billing settlement & post-session survey dispatch
    } catch {
      // Failure isolation: prevent secondary side-effect failures from disrupting primary unit of work
    }
  }

  /** Gets handled events history for testing/auditing */
  public getHandledEvents(): ReadonlyArray<AppointmentCompletedEvent> {
    return Object.freeze([...this.handledEvents]);
  }
}
