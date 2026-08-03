import { SchedulingDomainException } from './scheduling.exception';

export class InvalidDurationException extends SchedulingDomainException {
  public readonly code = 'INVALID_DURATION';

  constructor(message: string = 'Duration cannot be negative.') {
    super(message);
  }
}
