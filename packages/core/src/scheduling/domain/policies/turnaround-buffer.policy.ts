import { AppointmentType, AppointmentTypeEnum } from '../value-objects/appointment-type.vo';
import { TurnaroundBuffer } from '../value-objects/turnaround-buffer.vo';

/** Rule definition for turnaround buffer requirements */
export interface TurnaroundBufferRule {
  readonly appointmentType?: AppointmentTypeEnum;
  readonly roomId?: string;
  readonly therapistId?: string;
  readonly buffer: TurnaroundBuffer;
}

/** Parameters passed to compute required buffer */
export interface GetBufferParams {
  readonly appointmentType: AppointmentType;
  readonly roomId?: string;
  readonly therapistId?: string;
}

/**
 * Domain Policy calculating required operational turnaround buffer times
 * (prep setup & cleanup sanitation) around appointment scheduling intervals.
 */
export class TurnaroundBufferPolicy {
  private readonly rules: TurnaroundBufferRule[];

  constructor(rules: TurnaroundBufferRule[] = []) {
    this.rules = [...rules];
  }

  /**
   * Factory method configuring standard default facility turnaround buffer policies.
   */
  public static createDefault(): TurnaroundBufferPolicy {
    return new TurnaroundBufferPolicy([
      {
        appointmentType: AppointmentTypeEnum.TREATMENT,
        buffer: TurnaroundBuffer.of(0, 15),
      },
      {
        appointmentType: AppointmentTypeEnum.EVALUATION,
        buffer: TurnaroundBuffer.of(10, 10),
      },
    ]);
  }

  /**
   * Computes the turnaround buffer for a given appointment specification.
   * Checks room-specific, therapist-specific, and appointment-type rules,
   * returning maximum required prep & cleanup buffer durations.
   * Fallback: empty buffer (0 prep, 0 cleanup).
   */
  public getBufferFor(params: GetBufferParams): TurnaroundBuffer {
    let maxPrep = 0;
    let maxCleanup = 0;
    let matched = false;

    for (const rule of this.rules) {
      const matchType =
        !rule.appointmentType || rule.appointmentType === params.appointmentType.getValue();
      const matchRoom = !rule.roomId || rule.roomId === params.roomId;
      const matchTherapist = !rule.therapistId || rule.therapistId === params.therapistId;

      if (matchType && matchRoom && matchTherapist) {
        matched = true;
        maxPrep = Math.max(maxPrep, rule.buffer.prepDuration.toMinutes());
        maxCleanup = Math.max(maxCleanup, rule.buffer.cleanupDuration.toMinutes());
      }
    }

    if (!matched) {
      return TurnaroundBuffer.empty();
    }

    return TurnaroundBuffer.of(maxPrep, maxCleanup);
  }
}
