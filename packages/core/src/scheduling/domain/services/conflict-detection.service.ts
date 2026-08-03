import { SchedulingConflict } from '../value-objects/scheduling-conflict.vo';
import { TimeRange } from '../value-objects/time-range.vo';
import { AppointmentStatus } from '../value-objects/appointment-status.enum';
import { RoomStatus } from '../value-objects/room-status.enum';
import { BusinessCalendarService } from './business-calendar.service';
import { AppointmentRepository } from '../repositories/appointment.repository';
import { TherapistScheduleRepository } from '../repositories/therapist-schedule.repository';
import { RoomRepository } from '../repositories/room.repository';

export interface CheckConflictParams {
  readonly therapistId: string;
  readonly roomId: string;
  readonly clientId: string;
  readonly requestedRange: TimeRange;
  readonly excludeAppointmentId?: string;
  readonly requiredCapacity?: number;
  readonly requiredFeatures?: string[];
}

export class ConflictDetectionService {
  constructor(
    private readonly calendarService: BusinessCalendarService,
    private readonly appointmentRepo: AppointmentRepository,
    private readonly scheduleRepo: TherapistScheduleRepository,
    private readonly roomRepo: RoomRepository,
  ) {}

  public async detectConflicts(params: CheckConflictParams): Promise<SchedulingConflict[]> {
    const conflicts: SchedulingConflict[] = [];
    const { therapistId, roomId, clientId, requestedRange, excludeAppointmentId } = params;

    // 1. Business Calendar / Clinic Open Check
    if (!this.calendarService.isClinicOpen(requestedRange)) {
      conflicts.push(
        SchedulingConflict.create({
          conflictType: this.calendarService.isHoliday(requestedRange)
            ? 'HOLIDAY'
            : 'WORKING_HOURS',
          conflictingEntityId: 'CLINIC',
          requestedRange,
          reason: 'Facility is closed or observing a public holiday.',
        }),
      );
    }

    // 2. Therapist Schedule Check
    const schedule = await this.scheduleRepo.findByTherapistId(therapistId);
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
      if (schedule.isVacation(requestedRange)) {
        conflicts.push(
          SchedulingConflict.create({
            conflictType: 'VACATION',
            conflictingEntityId: therapistId,
            requestedRange,
            reason: 'Therapist is on scheduled vacation.',
          }),
        );
      } else if (!schedule.isAvailable(requestedRange)) {
        conflicts.push(
          SchedulingConflict.create({
            conflictType: 'WORKING_HOURS',
            conflictingEntityId: therapistId,
            requestedRange,
            reason: 'Therapist is unavailable during requested hours or break period.',
          }),
        );
      }
    }

    // 3. Therapist Booking Overlap Check
    const therapistAppts = await this.appointmentRepo.findByTherapistId(
      therapistId,
      requestedRange,
    );
    const conflictingTherapistAppt = therapistAppts.find(
      (a) =>
        a.id.getValue() !== excludeAppointmentId &&
        a.status !== AppointmentStatus.CANCELLED &&
        a.timeRange.overlaps(requestedRange),
    );

    if (conflictingTherapistAppt) {
      conflicts.push(
        SchedulingConflict.create({
          conflictType: 'THERAPIST',
          conflictingEntityId: therapistId,
          requestedRange,
          reason: 'Therapist has a conflicting active appointment.',
        }),
      );
    }

    // 4. Room Operational Status & Booking Overlap Check
    const room = await this.roomRepo.findById(roomId);
    if (!room || room.status !== RoomStatus.AVAILABLE) {
      conflicts.push(
        SchedulingConflict.create({
          conflictType: 'ROOM',
          conflictingEntityId: roomId,
          requestedRange,
          reason: `Room '${roomId}' is not available (status: ${room ? room.status : 'NOT_FOUND'}).`,
        }),
      );
    } else {
      if (params.requiredCapacity && room.capacity < params.requiredCapacity) {
        conflicts.push(
          SchedulingConflict.create({
            conflictType: 'ROOM',
            conflictingEntityId: roomId,
            requestedRange,
            reason: `Room capacity (${room.capacity}) is less than required (${params.requiredCapacity}).`,
          }),
        );
      }

      if (params.requiredFeatures && !room.supportsFeatures(params.requiredFeatures)) {
        conflicts.push(
          SchedulingConflict.create({
            conflictType: 'ROOM',
            conflictingEntityId: roomId,
            requestedRange,
            reason: 'Room does not support all required features.',
          }),
        );
      }
    }

    const roomAppts = await this.appointmentRepo.findByRoomId(roomId, requestedRange);
    const conflictingRoomAppt = roomAppts.find(
      (a) =>
        a.id.getValue() !== excludeAppointmentId &&
        a.status !== AppointmentStatus.CANCELLED &&
        a.timeRange.overlaps(requestedRange),
    );

    if (conflictingRoomAppt) {
      conflicts.push(
        SchedulingConflict.create({
          conflictType: 'ROOM',
          conflictingEntityId: roomId,
          requestedRange,
          reason: 'Room is already booked during requested time.',
        }),
      );
    }

    // 5. Client Booking Overlap Check
    const clientAppts = await this.appointmentRepo.findByClientId(clientId, requestedRange);
    const conflictingClientAppt = clientAppts.find(
      (a) =>
        a.id.getValue() !== excludeAppointmentId &&
        a.status !== AppointmentStatus.CANCELLED &&
        a.timeRange.overlaps(requestedRange),
    );

    if (conflictingClientAppt) {
      conflicts.push(
        SchedulingConflict.create({
          conflictType: 'CLIENT',
          conflictingEntityId: clientId,
          requestedRange,
          reason: 'Client has an overlapping active appointment.',
        }),
      );
    }

    return conflicts;
  }
}
