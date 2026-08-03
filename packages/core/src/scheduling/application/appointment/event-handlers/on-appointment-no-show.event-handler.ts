import { EventHandler } from '../../shared/event-handler.interface';
import { AppointmentNoShowEvent } from '../../../domain/events/appointment-no-show.event';

/**
 * Domain Event Subscriber processing AppointmentNoShowEvent notifications.
 */
export class OnAppointmentNoShowEventHandler implements EventHandler<AppointmentNoShowEvent> {
  private readonly handledEvents: AppointmentNoShowEvent[] = [];

  /** Handles appointment no-show side effects with failure isolation */
  public async handle(event: AppointmentNoShowEvent): Promise<void> {
    try {
      this.handledEvents.push(event);
      // Placeholder side effect: Apply no-show fee & flag client attendance record
    } catch {
      // Failure isolation: prevent secondary side-effect failures from disrupting primary unit of work
    }
  }

  /** Gets handled events history for testing/auditing */
  public getHandledEvents(): ReadonlyArray<AppointmentNoShowEvent> {
    return Object.freeze([...this.handledEvents]);
  }
}
