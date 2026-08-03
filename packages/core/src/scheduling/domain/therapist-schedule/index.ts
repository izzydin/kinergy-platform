import { AggregateRoot } from '../shared/aggregate-root';

export interface TimeSlotWindow {
  readonly startTime: Date;
  readonly endTime: Date;
}

/**
 * Placeholder Aggregate Root contract for TherapistSchedule.
 */
export interface TherapistScheduleAggregate extends AggregateRoot<string> {
  readonly therapistId: string;
  readonly workingHours: ReadonlyArray<TimeSlotWindow>;
  readonly timeOff: ReadonlyArray<TimeSlotWindow>;
}
