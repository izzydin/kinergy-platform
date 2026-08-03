import { SchedulingDomainException } from './scheduling.exception';

export class TherapistUnavailableException extends SchedulingDomainException {
  public readonly code = 'THERAPIST_UNAVAILABLE';

  constructor(
    public readonly therapistId: string,
    message?: string,
  ) {
    super(message ?? `Therapist '${therapistId}' is unavailable for the requested time range.`);
  }
}
