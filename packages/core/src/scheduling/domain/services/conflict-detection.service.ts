import { SchedulingConflict, ConflictType } from '../value-objects/scheduling-conflict.vo';
import { TimeRange } from '../value-objects/time-range.vo';
import { AppointmentType } from '../value-objects/appointment-type.vo';
import { TurnaroundBuffer } from '../value-objects/turnaround-buffer.vo';
import { BusinessCalendarService } from './business-calendar.service';
import { AppointmentRepository } from '../repositories/appointment.repository';
import { TherapistScheduleRepository } from '../repositories/therapist-schedule.repository';
import { RoomRepository } from '../repositories/room.repository';
import { TherapistAvailabilityEvaluator } from './therapist-availability-evaluator.service';
import { RoomAvailabilityEvaluator } from './room-availability-evaluator.service';
import { ClientAvailabilityEvaluator } from './client-availability-evaluator.service';
import { TurnaroundBufferPolicy } from '../policies/turnaround-buffer.policy';

/** Input parameters for conflict detection */
export interface CheckConflictParams {
  readonly therapistId: string;
  readonly roomId: string;
  readonly clientId: string;
  readonly requestedRange: TimeRange;
  readonly appointmentType?: AppointmentType;
  readonly excludeAppointmentId?: string;
  readonly ignoreAppointmentId?: string;
  readonly requiredCapacity?: number;
  readonly requiredFeatures?: string[];
}

/** Diagnostic report returned by conflict evaluation */
export interface ConflictDetectionResult {
  readonly hasConflicts: boolean;
  readonly conflicts: SchedulingConflict[];
}

/**
 * Senior 4-Dimensional Conflict Detection Engine validating booking requests
 * across Therapist, Room, Client, and Clinic Calendar vectors with turnaround buffers.
 */
export class ConflictDetectionService {
  private readonly therapistEvaluator: TherapistAvailabilityEvaluator;
  private readonly roomEvaluator: RoomAvailabilityEvaluator;
  private readonly clientEvaluator: ClientAvailabilityEvaluator;
  private readonly bufferPolicy: TurnaroundBufferPolicy;

  constructor(
    private readonly calendarService: BusinessCalendarService,
    private readonly appointmentRepo: AppointmentRepository,
    private readonly scheduleRepo: TherapistScheduleRepository,
    private readonly roomRepo: RoomRepository,
    bufferPolicy?: TurnaroundBufferPolicy,
  ) {
    this.therapistEvaluator = new TherapistAvailabilityEvaluator();
    this.roomEvaluator = new RoomAvailabilityEvaluator();
    this.clientEvaluator = new ClientAvailabilityEvaluator();
    this.bufferPolicy = bufferPolicy ?? TurnaroundBufferPolicy.createDefault();
  }

  /**
   * Evaluates 4D conflicts and returns a structured diagnostic report.
   */
  public async evaluateConflicts(params: CheckConflictParams): Promise<ConflictDetectionResult> {
    const conflicts = await this.detectConflicts(params);
    return {
      hasConflicts: conflicts.length > 0,
      conflicts,
    };
  }

  /**
   * Main conflict detection engine running matrix evaluations across 4 dimensions.
   */
  public async detectConflicts(params: CheckConflictParams): Promise<SchedulingConflict[]> {
    const conflicts: SchedulingConflict[] = [];
    const { therapistId, roomId, clientId, requestedRange, appointmentType } = params;
    const excludeId = params.excludeAppointmentId ?? params.ignoreAppointmentId;

    // 1. Vector 1: Clinic Calendar & Facility Closure Check
    if (!this.calendarService.isClinicOpen(requestedRange)) {
      const isHoliday = this.calendarService.isHoliday(requestedRange);
      conflicts.push(
        SchedulingConflict.create({
          conflictType: (isHoliday ? 'HOLIDAY' : 'WORKING_HOURS') as ConflictType,
          conflictingEntityId: 'CLINIC',
          requestedRange,
          reason: isHoliday
            ? 'Facility is closed observing a public holiday.'
            : 'Requested interval falls outside clinic operating hours.',
        }),
      );
    }

    // Determine Turnaround Buffer
    const buffer = appointmentType
      ? this.bufferPolicy.getBufferFor({ appointmentType, roomId, therapistId })
      : TurnaroundBuffer.empty();

    const bufferMarginMs = buffer.isEmpty()
      ? 0
      : Math.max(buffer.prepDuration.toMilliseconds(), buffer.cleanupDuration.toMilliseconds());

    const queryRange =
      bufferMarginMs === 0
        ? requestedRange
        : TimeRange.create(
            new Date(requestedRange.start.getTime() - bufferMarginMs),
            new Date(requestedRange.end.getTime() + bufferMarginMs),
          );

    // 2. Vector 2: Therapist Schedule & Appointment Overlap Check
    const schedule = await this.scheduleRepo.findByTherapistId(therapistId);
    const therapistAppts = await this.appointmentRepo.findAppointmentsForTherapist(
      therapistId,
      queryRange,
    );

    if (!schedule) {
      conflicts.push(
        SchedulingConflict.create({
          conflictType: 'THERAPIST',
          conflictingEntityId: therapistId,
          requestedRange,
          reason: `No active schedule found for therapist '${therapistId}'.`,
        }),
      );
    } else {
      const therapistResult = this.therapistEvaluator.evaluate({
        schedule,
        existingAppointments: therapistAppts,
        targetRange: requestedRange,
        buffer,
        excludeAppointmentId: excludeId,
      });

      if (!therapistResult.isAvailable) {
        const conflictType: ConflictType = schedule.isVacation(requestedRange)
          ? 'VACATION'
          : 'THERAPIST';
        conflicts.push(
          SchedulingConflict.create({
            conflictType,
            conflictingEntityId: therapistId,
            requestedRange,
            reason: therapistResult.reason ?? 'Therapist is unavailable.',
          }),
        );
      }
    }

    // 3. Vector 3: Room Availability, Features, Capacity & Booking Overlap Check
    const room = await this.roomRepo.findById(roomId);
    const roomAppts = await this.appointmentRepo.findAppointmentsForRoom(roomId, queryRange);

    if (!room) {
      conflicts.push(
        SchedulingConflict.create({
          conflictType: 'ROOM',
          conflictingEntityId: roomId,
          requestedRange,
          reason: `Room '${roomId}' not found in facility records.`,
        }),
      );
    } else {
      const roomResult = this.roomEvaluator.evaluate({
        room,
        existingAppointments: roomAppts,
        targetRange: requestedRange,
        buffer,
        requiredFeatures: params.requiredFeatures,
        requiredCapacity: params.requiredCapacity,
        excludeAppointmentId: excludeId,
      });

      if (!roomResult.isAvailable) {
        conflicts.push(
          SchedulingConflict.create({
            conflictType: 'ROOM',
            conflictingEntityId: roomId,
            requestedRange,
            reason: roomResult.reason ?? 'Room is unavailable.',
          }),
        );
      }
    }

    // 4. Vector 4: Client Multi-Booking Overlap Check
    const clientAppts = await this.appointmentRepo.findAppointmentsForClient(clientId, queryRange);

    const clientResult = this.clientEvaluator.evaluate({
      clientId,
      existingAppointments: clientAppts,
      targetRange: requestedRange,
      excludeAppointmentId: excludeId,
    });

    if (!clientResult.isAvailable) {
      conflicts.push(
        SchedulingConflict.create({
          conflictType: 'CLIENT',
          conflictingEntityId: clientId,
          requestedRange,
          reason: clientResult.reason ?? 'Client has an overlapping active appointment.',
        }),
      );
    }

    return conflicts;
  }
}
