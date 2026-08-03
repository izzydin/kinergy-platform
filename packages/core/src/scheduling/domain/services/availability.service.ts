import { TimeRange } from '../value-objects/time-range.vo';
import { Duration } from '../value-objects/duration.vo';
import { AppointmentStatus } from '../value-objects/appointment-status.enum';
import { RoomStatus } from '../value-objects/room-status.enum';
import { BusinessCalendarService } from './business-calendar.service';
import { AppointmentRepository } from '../repositories/appointment.repository';
import { TherapistScheduleRepository } from '../repositories/therapist-schedule.repository';
import { RoomRepository } from '../repositories/room.repository';

export interface SlotSearchRequest {
  readonly therapistId: string;
  readonly roomId: string;
  readonly clientId?: string;
  readonly duration: Duration;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly requiredCapacity?: number;
  readonly requiredFeatures?: string[];
}

export class AvailabilityService {
  constructor(
    private readonly calendarService: BusinessCalendarService,
    private readonly appointmentRepo: AppointmentRepository,
    private readonly scheduleRepo: TherapistScheduleRepository,
    private readonly roomRepo: RoomRepository,
  ) {}

  public async findAvailableSlots(params: SlotSearchRequest): Promise<TimeRange[]> {
    const {
      therapistId,
      roomId,
      clientId,
      duration,
      startDate,
      endDate,
      requiredCapacity,
      requiredFeatures,
    } = params;

    const availableSlots: TimeRange[] = [];
    const slotMs = duration.toMilliseconds();
    if (slotMs <= 0 || startDate.getTime() >= endDate.getTime()) {
      return availableSlots;
    }

    const searchRange = TimeRange.create(startDate, endDate);

    // Fetch resources
    const [schedule, room, therapistAppts, roomAppts, clientAppts] = await Promise.all([
      this.scheduleRepo.findByTherapistId(therapistId),
      this.roomRepo.findById(roomId),
      this.appointmentRepo.findAppointmentsForTherapist(therapistId, searchRange),
      this.appointmentRepo.findAppointmentsForRoom(roomId, searchRange),
      clientId
        ? this.appointmentRepo.findAppointmentsForClient(clientId, searchRange)
        : Promise.resolve([]),
    ]);

    if (!schedule || !room || room.status !== RoomStatus.AVAILABLE) {
      return availableSlots;
    }

    if (requiredCapacity && room.capacity < requiredCapacity) {
      return availableSlots;
    }

    if (requiredFeatures && !room.supportsFeatures(requiredFeatures)) {
      return availableSlots;
    }

    // Step in 15-minute increments (900,000 ms)
    const stepMs = 15 * 60 * 1000;
    let currentStartMs = startDate.getTime();

    while (currentStartMs + slotMs <= endDate.getTime()) {
      const candidateStart = new Date(currentStartMs);
      const candidateEnd = new Date(currentStartMs + slotMs);

      try {
        const candidateSlot = TimeRange.create(candidateStart, candidateEnd);

        // 1. Clinic Open Check
        if (this.calendarService.isClinicOpen(candidateSlot)) {
          // 2. Therapist Availability Check
          if (schedule.isAvailable(candidateSlot)) {
            // 3. Therapist Booking Overlap Check
            const therapistOverlap = therapistAppts.some(
              (a) =>
                a.status !== AppointmentStatus.CANCELLED && a.timeRange.overlaps(candidateSlot),
            );

            if (!therapistOverlap) {
              // 4. Room Booking Overlap Check
              const roomOverlap = roomAppts.some(
                (a) =>
                  a.status !== AppointmentStatus.CANCELLED && a.timeRange.overlaps(candidateSlot),
              );

              if (!roomOverlap) {
                // 5. Client Booking Overlap Check (if clientId provided)
                const clientOverlap = clientAppts.some(
                  (a) =>
                    a.status !== AppointmentStatus.CANCELLED && a.timeRange.overlaps(candidateSlot),
                );

                if (!clientOverlap) {
                  availableSlots.push(candidateSlot);
                }
              }
            }
          }
        }
      } catch {
        // Skip invalid boundaries
      }

      currentStartMs += stepMs;
    }

    return availableSlots;
  }
}
