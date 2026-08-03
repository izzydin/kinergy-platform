import { SchedulingDomainException } from './scheduling.exception';

export class BookingWindowViolationException extends SchedulingDomainException {
  public readonly code = 'BOOKING_WINDOW_VIOLATION';

  constructor(
    message: string = 'Booking violates advance notice or maximum advance window policies.',
  ) {
    super(message);
  }
}
