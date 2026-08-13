import { RecurringSeriesCancelledEvent } from '../../../domain/events/recurring-series-cancelled.event';

export class OnRecurringSeriesCancelledEventHandler {
  private readonly handledEvents: RecurringSeriesCancelledEvent[] = [];

  public async handle(event: RecurringSeriesCancelledEvent): Promise<void> {
    this.handledEvents.push(event);
  }

  public getHandledEvents(): ReadonlyArray<RecurringSeriesCancelledEvent> {
    return Object.freeze([...this.handledEvents]);
  }

  public clear(): void {
    this.handledEvents.length = 0;
  }
}
