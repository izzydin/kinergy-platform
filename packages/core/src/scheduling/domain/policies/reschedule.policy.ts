import { Clock } from '../shared/clock';
import { Duration } from '../value-objects/duration.vo';

export interface ReschedulePolicyConfig {
  readonly maxReschedules: number;
  readonly minNotice: Duration;
}

export class ReschedulePolicy {
  private readonly config: ReschedulePolicyConfig;

  constructor(customConfig?: Partial<ReschedulePolicyConfig>) {
    this.config = {
      maxReschedules: customConfig?.maxReschedules ?? 3,
      minNotice: customConfig?.minNotice ?? Duration.fromHours(12),
    };
  }

  public validateReschedule(
    currentRescheduleCount: number,
    appointmentStart: Date,
    newTime: Date,
    clock: Clock,
  ): { isValid: boolean; reason?: string } {
    if (currentRescheduleCount >= this.config.maxReschedules) {
      return {
        isValid: false,
        reason: `Maximum allowed reschedules (${this.config.maxReschedules}) exceeded for this appointment.`,
      };
    }

    const now = clock.now();
    const noticeGivenMs = appointmentStart.getTime() - now.getTime();
    if (noticeGivenMs < this.config.minNotice.toMilliseconds()) {
      return {
        isValid: false,
        reason: `Rescheduling requires at least ${this.config.minNotice.toHours()} hour(s) advance notice before current appointment start time.`,
      };
    }

    if (newTime.getTime() <= now.getTime()) {
      return {
        isValid: false,
        reason: 'New appointment time must be in the future.',
      };
    }

    return { isValid: true };
  }
}
