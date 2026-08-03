import { EventHandler } from '../../shared/event-handler.interface';
import { AppointmentCreatedEvent } from '../../../domain/events/appointment-created.event';

/**
 * Domain Event Subscriber processing AppointmentCreatedEvent notifications.
 */
export class OnAppointmentCreatedEventHandler implements EventHandler<AppointmentCreatedEvent> {
  private readonly handledEvents: AppointmentCreatedEvent[] = [];

  /** Handles appointment created side effects with failure isolation */
  public async handle(event: AppointmentCreatedEvent): Promise<void> {
    try {
      this.handledEvents.push(event);
      // Placeholder side effect: Trigger client booking confirmation email & SMS notification
    } catch {
      // Failure isolation: prevent secondary side-effect failures from disrupting primary unit of work
    }
  }

  /** Gets handled events history for testing/auditing */
  public getHandledEvents(): ReadonlyArray<AppointmentCreatedEvent> {
    return Object.freeze([...this.handledEvents]);
  }
}
