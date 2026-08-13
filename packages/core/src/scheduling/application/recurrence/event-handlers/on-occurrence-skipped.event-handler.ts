import { OccurrenceSkippedEvent } from '../../../domain/events/occurrence-skipped.event';

export class OnOccurrenceSkippedEventHandler {
  private readonly handledEvents: OccurrenceSkippedEvent[] = [];

  public async handle(event: OccurrenceSkippedEvent): Promise<void> {
    this.handledEvents.push(event);
  }

  public getHandledEvents(): ReadonlyArray<OccurrenceSkippedEvent> {
    return Object.freeze([...this.handledEvents]);
  }

  public clear(): void {
    this.handledEvents.length = 0;
  }
}
