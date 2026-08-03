import { SchedulingDomainException } from './scheduling.exception';

export class WorkingHoursViolationException extends SchedulingDomainException {
  public readonly code = 'WORKING_HOURS_VIOLATION';

  constructor(
    message: string = 'Requested appointment time falls outside therapist working hours.',
  ) {
    super(message);
  }
}
