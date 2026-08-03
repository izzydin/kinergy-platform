import { Duration } from '../value-objects/duration.vo';

export interface CancellationPolicyConfig {
  readonly noticeCutoff: Duration;
}

export class CancellationPolicy {
  private readonly config: CancellationPolicyConfig;

  constructor(customConfig?: Partial<CancellationPolicyConfig>) {
    this.config = {
      noticeCutoff: customConfig?.noticeCutoff ?? Duration.fromHours(24),
    };
  }

  public evaluateCancellation(
    appointmentStart: Date,
    cancellationTime: Date,
  ): { isLateCancellation: boolean; penaltyApplies: boolean; reason: string } {
    const cutoffMs = this.config.noticeCutoff.toMilliseconds();
    const noticeGivenMs = appointmentStart.getTime() - cancellationTime.getTime();

    if (noticeGivenMs < cutoffMs) {
      return {
        isLateCancellation: true,
        penaltyApplies: true,
        reason: `Cancellation notice (${Math.max(0, Math.floor(noticeGivenMs / (60 * 1000)))}m) is less than the required ${this.config.noticeCutoff.toHours()}h cutoff. Late cancellation fee applies.`,
      };
    }

    return {
      isLateCancellation: false,
      penaltyApplies: false,
      reason: 'Cancellation provided within compliant advance notice window.',
    };
  }
}
