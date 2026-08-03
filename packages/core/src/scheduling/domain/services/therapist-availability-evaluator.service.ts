import { TherapistSchedule } from '../therapist-schedule/therapist-schedule.aggregate';
import { Appointment } from '../appointment/appointment.aggregate';
import { TimeRange } from '../value-objects/time-range.vo';
import { TurnaroundBuffer } from '../value-objects/turnaround-buffer.vo';
import { AppointmentStatus } from '../value-objects/appointment-status.enum';

/** Structured result returned by resource availability evaluators */
export interface EvaluatorResult {
  readonly isAvailable: boolean;
  readonly reason?: string;
}

/** Parameters required to evaluate therapist availability */
export interface EvaluateTherapistAvailabilityParams {
  readonly schedule?: TherapistSchedule | null;
  readonly existingAppointments: Appointment[];
  readonly targetRange: TimeRange;
  readonly buffer?: TurnaroundBuffer;
  readonly excludeAppointmentId?: string;
}

/**
 * Domain Service evaluating Therapist availability across working shift hours,
 * vacations (-), overrides (+/-), break periods (-), and existing buffered appointments (-).
 */
export class TherapistAvailabilityEvaluator {
  /**
   * Evaluates therapist availability for a candidate time range.
   */
  public evaluate(params: EvaluateTherapistAvailabilityParams): EvaluatorResult {
    const { schedule, existingAppointments, targetRange, buffer, excludeAppointmentId } = params;

    // 1. If schedule exists, evaluate schedule rules (Vacation -> Overrides -> Breaks -> Working Hours)
    if (schedule) {
      if (schedule.isVacation(targetRange)) {
        return {
          isAvailable: false,
          reason: `Therapist '${schedule.therapistId}' is on vacation during requested interval.`,
        };
      }

      const matchingOverride = schedule.overrides.find((ov) => ov.overlaps(targetRange));
      if (matchingOverride) {
        if (matchingOverride.type === 'UNAVAILABLE') {
          return {
            isAvailable: false,
            reason: `Therapist '${schedule.therapistId}' is marked UNAVAILABLE by override: ${matchingOverride.reason ?? 'No reason provided'}`,
          };
        }
      } else {
        if (schedule.isBreak(targetRange)) {
          return {
            isAvailable: false,
            reason: `Therapist '${schedule.therapistId}' is on break during requested interval.`,
          };
        }

        if (!schedule.isWorking(targetRange)) {
          return {
            isAvailable: false,
            reason: `Requested interval falls outside therapist '${schedule.therapistId}' working hours.`,
          };
        }
      }
    }

    // 2. Evaluate existing appointment overlaps with turnaround buffer
    const effectiveBuffer = buffer ?? TurnaroundBuffer.empty();
    const candidateBufferedRange = targetRange.toBufferedRange(effectiveBuffer);

    for (const appt of existingAppointments) {
      if (excludeAppointmentId && appt.id.toString() === excludeAppointmentId) {
        continue;
      }
      if (this.isTerminal(appt.status)) {
        continue;
      }

      const apptBufferedRange = appt.timeRange.toBufferedRange(effectiveBuffer);
      if (candidateBufferedRange.overlaps(apptBufferedRange)) {
        return {
          isAvailable: false,
          reason: `Therapist has conflicting appointment '${appt.id.toString()}' from ${appt.timeRange.start.toISOString()} to ${appt.timeRange.end.toISOString()}.`,
        };
      }
    }

    return { isAvailable: true };
  }

  private isTerminal(status: AppointmentStatus): boolean {
    return (
      status === AppointmentStatus.COMPLETED ||
      status === AppointmentStatus.CANCELLED ||
      status === AppointmentStatus.NO_SHOW
    );
  }
}
