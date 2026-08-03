import { EvaluatorResult } from './therapist-availability-evaluator.service';
import { Room } from '../room/room.aggregate';
import { Appointment } from '../appointment/appointment.aggregate';
import { TimeRange } from '../value-objects/time-range.vo';
import { TurnaroundBuffer } from '../value-objects/turnaround-buffer.vo';
import { RoomStatus } from '../value-objects/room-status.enum';
import { AppointmentStatus } from '../value-objects/appointment-status.enum';

/** Parameters required to evaluate room availability */
export interface EvaluateRoomAvailabilityParams {
  readonly room: Room;
  readonly existingAppointments: Appointment[];
  readonly targetRange: TimeRange;
  readonly buffer?: TurnaroundBuffer;
  readonly requiredFeatures?: string[];
  readonly requiredCapacity?: number;
  readonly excludeAppointmentId?: string;
}

/**
 * Domain Service evaluating Room availability across operational status,
 * capacity bounds, required equipment feature match, and existing room buffered appointments.
 */
export class RoomAvailabilityEvaluator {
  /**
   * Evaluates room availability for a candidate time range.
   */
  public evaluate(params: EvaluateRoomAvailabilityParams): EvaluatorResult {
    const {
      room,
      existingAppointments,
      targetRange,
      buffer,
      requiredFeatures,
      requiredCapacity,
      excludeAppointmentId,
    } = params;

    // 1. Room Operational Status Check
    if (room.status !== RoomStatus.AVAILABLE) {
      return {
        isAvailable: false,
        reason: `Room '${room.name}' (${room.id.toString()}) is currently ${room.status}: ${room.maintenanceReason ?? 'No reason specified'}`,
      };
    }

    // 2. Capacity Check
    if (requiredCapacity && requiredCapacity > 0 && room.capacity < requiredCapacity) {
      return {
        isAvailable: false,
        reason: `Room '${room.name}' capacity (${room.capacity}) is less than required capacity (${requiredCapacity}).`,
      };
    }

    // 3. Equipment & Features Check
    if (requiredFeatures && requiredFeatures.length > 0) {
      if (!room.supportsFeatures(requiredFeatures)) {
        return {
          isAvailable: false,
          reason: `Room '${room.name}' does not support all required features: [${requiredFeatures.join(', ')}].`,
        };
      }
    }

    // 4. Existing Room Appointments Overlap Check with Turnaround Buffer
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
          reason: `Room '${room.name}' has conflicting appointment '${appt.id.toString()}' from ${appt.timeRange.start.toISOString()} to ${appt.timeRange.end.toISOString()}.`,
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
