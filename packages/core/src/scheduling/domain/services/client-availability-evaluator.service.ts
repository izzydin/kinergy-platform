import { EvaluatorResult } from './therapist-availability-evaluator.service';
import { Appointment } from '../appointment/appointment.aggregate';
import { TimeRange } from '../value-objects/time-range.vo';
import { AppointmentStatus } from '../value-objects/appointment-status.enum';

/** Parameters required to evaluate client availability */
export interface EvaluateClientAvailabilityParams {
  readonly clientId: string;
  readonly existingAppointments: Appointment[];
  readonly targetRange: TimeRange;
  readonly excludeAppointmentId?: string;
}

/**
 * Domain Service evaluating Client availability ensuring zero overlapping active appointments
 * across all facility services.
 */
export class ClientAvailabilityEvaluator {
  /**
   * Evaluates client availability for a candidate time range.
   */
  public evaluate(params: EvaluateClientAvailabilityParams): EvaluatorResult {
    const { clientId, existingAppointments, targetRange, excludeAppointmentId } = params;

    for (const appt of existingAppointments) {
      if (excludeAppointmentId && appt.id.toString() === excludeAppointmentId) {
        continue;
      }
      if (this.isTerminal(appt.status)) {
        continue;
      }

      if (targetRange.overlaps(appt.timeRange)) {
        return {
          isAvailable: false,
          reason: `Client '${clientId}' already has an overlapping active appointment '${appt.id.toString()}' from ${appt.timeRange.start.toISOString()} to ${appt.timeRange.end.toISOString()}.`,
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
