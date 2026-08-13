import { RecurringAppointmentCreatedEvent } from '../../../domain/events/recurring-appointment-created.event';

export class OnRecurringAppointmentCreatedEventHandler {
  private readonly handledEvents: RecurringAppointmentCreatedEvent[] = [];

  public async handle(event: RecurringAppointmentCreatedEvent): Promise<void> {
    this.handledEvents.push(event);
  }

  public getHandledEvents(): ReadonlyArray<RecurringAppointmentCreatedEvent> {
    return Object.freeze([...this.handledEvents]);
  }

  public clear(): void {
    this.handledEvents.length = 0;
  }
}
