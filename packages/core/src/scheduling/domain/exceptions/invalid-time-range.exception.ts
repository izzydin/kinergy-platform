import { SchedulingDomainException } from './scheduling.exception';

export class InvalidTimeRangeException extends SchedulingDomainException {
  public readonly code = 'INVALID_TIME_RANGE';

  constructor(
    message: string = 'Invalid time range: start time must be strictly before end time.',
  ) {
    super(message);
  }
}
