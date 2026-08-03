import { SchedulingDomainException } from './scheduling.exception';

export class InvalidAppointmentTransitionException extends SchedulingDomainException {
  public readonly code = 'INVALID_APPOINTMENT_TRANSITION';

  constructor(
    public readonly currentStatus: string,
    public readonly targetStatus: string,
    message?: string,
  ) {
    super(
      message ??
        `Cannot transition appointment status from '${currentStatus}' to '${targetStatus}'.`,
    );
  }
}
