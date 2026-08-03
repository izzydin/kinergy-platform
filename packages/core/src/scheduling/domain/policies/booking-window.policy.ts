import { Clock } from '../shared/clock';
import { Duration } from '../value-objects/duration.vo';

export interface BookingWindowConfig {
  readonly minNotice: Duration;
  readonly maxAdvanceHorizonDays: number;
}

export class BookingWindowPolicy {
  private readonly config: BookingWindowConfig;

  constructor(customConfig?: Partial<BookingWindowConfig>) {
    this.config = {
      minNotice: customConfig?.minNotice ?? Duration.fromHours(2),
      maxAdvanceHorizonDays: customConfig?.maxAdvanceHorizonDays ?? 90,
    };
  }

  public validateBookingWindow(
    appointmentStart: Date,
    clock: Clock,
  ): { isValid: boolean; reason?: string } {
    const now = clock.now();
    const minStart = new Date(now.getTime() + this.config.minNotice.toMilliseconds());

    if (appointmentStart.getTime() < minStart.getTime()) {
      return {
        isValid: false,
        reason: `Appointment must be scheduled at least ${this.config.minNotice.toHours()} hour(s) in advance.`,
      };
    }

    const maxHorizonMs = this.config.maxAdvanceHorizonDays * 24 * 60 * 60 * 1000;
    const maxStart = new Date(now.getTime() + maxHorizonMs);

    if (appointmentStart.getTime() > maxStart.getTime()) {
      return {
        isValid: false,
        reason: `Appointment cannot be scheduled more than ${this.config.maxAdvanceHorizonDays} days in advance.`,
      };
    }

    return { isValid: true };
  }
}
