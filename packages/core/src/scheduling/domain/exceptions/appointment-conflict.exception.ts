import { SchedulingDomainException } from './scheduling.exception';
import { SchedulingConflict } from '../value-objects/scheduling-conflict.vo';

export class AppointmentConflictException extends SchedulingDomainException {
  public readonly code = 'APPOINTMENT_CONFLICT';
  public readonly conflicts: ReadonlyArray<SchedulingConflict>;

  constructor(conflicts: Iterable<SchedulingConflict>, message?: string) {
    const conflictArray = Array.from(conflicts);
    super(
      message ?? `Scheduling request failed due to ${conflictArray.length} domain conflict(s).`,
    );
    this.conflicts = Object.freeze(conflictArray);
  }
}
