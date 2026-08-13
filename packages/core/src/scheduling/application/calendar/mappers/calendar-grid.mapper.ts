import { Appointment } from '../../../domain/appointment/appointment.aggregate';
import { Room } from '../../../domain/room/room.aggregate';
import { RoomStatus } from '../../../domain/value-objects/room-status.enum';
import { TherapistSchedule } from '../../../domain/therapist-schedule/therapist-schedule.aggregate';
import { CalendarSlotDTO } from '../dtos/calendar-slot.dto';

export interface CalendarGridMapperOptions {
  /** Slot duration interval in minutes (e.g., 15, 30, or 60). Default is 30. */
  readonly intervalMinutes?: number;
  /** Start hour for daily grid generation (0..23). Default is 8 (08:00). */
  readonly startHour?: number;
  /** End hour for daily grid generation (1..24). Default is 20 (20:00). */
  readonly endHour?: number;
  /** Timezone identifier string. Default is 'UTC'. */
  readonly timezone?: string;
}

export interface MapGridSlotsParams {
  readonly date: Date;
  readonly appointments: Appointment[];
  readonly schedules?: TherapistSchedule[];
  readonly rooms?: Room[];
  readonly therapistId?: string;
  readonly roomId?: string;
  readonly options?: CalendarGridMapperOptions;
}

/**
 * Pure Grid Computation Mapper.
 * Converts domain entities (Appointments, TherapistSchedules, Rooms) into structured
 * hour-by-hour operational calendar matrices with conflict indicators and overlap counts.
 */
export class CalendarGridMapper {
  /**
   * Generates discrete time slot boundaries for a specific day based on configured interval and hours.
   */
  public static generateTimeSlots(
    date: Date,
    options: CalendarGridMapperOptions = {},
  ): Array<{ startTime: Date; endTime: Date }> {
    const interval = options.intervalMinutes ?? 30;
    const startHour = options.startHour ?? 8;
    const endHour = options.endHour ?? 20;

    const baseYear = date.getUTCFullYear();
    const baseMonth = date.getUTCMonth();
    const baseDay = date.getUTCDate();

    const slots: Array<{ startTime: Date; endTime: Date }> = [];
    const totalMinutesStart = startHour * 60;
    const totalMinutesEnd = endHour * 60;

    for (let minutes = totalMinutesStart; minutes < totalMinutesEnd; minutes += interval) {
      const startH = Math.floor(minutes / 60);
      const startM = minutes % 60;

      const endMinutes = minutes + interval;
      const endH = Math.floor(endMinutes / 60);
      const endM = endMinutes % 60;

      const startTime = new Date(Date.UTC(baseYear, baseMonth, baseDay, startH, startM, 0, 0));
      const endTime = new Date(Date.UTC(baseYear, baseMonth, baseDay, endH, endM, 0, 0));

      slots.push({ startTime, endTime });
    }

    return slots;
  }

  /**
   * Converts a single Appointment aggregate into a pure CalendarSlotDTO.
   */
  public static mapAppointmentToSlot(appointment: Appointment): CalendarSlotDTO {
    return {
      id: `slot-appt-${appointment.id.getValue()}`,
      startTime: appointment.timeRange.start.toISOString(),
      endTime: appointment.timeRange.end.toISOString(),
      status: appointment.status as CalendarSlotDTO['status'],
      appointmentId: appointment.id.getValue(),
      therapistId: appointment.therapistId,
      roomId: appointment.roomId,
      clientId: appointment.clientId,
      clientName: `Client ${appointment.clientId}`,
      serviceType: appointment.type.getValue(),
      hasConflict: false,
      overlapCount: 1,
    };
  }

  /**
   * Computes conflict indicators and overlap counts across slots.
   * Identifies concurrent active appointments sharing therapist or room resources.
   */
  public static computeConflicts(slots: CalendarSlotDTO[]): CalendarSlotDTO[] {
    const activeSlots = slots.filter((slot) => slot.status !== 'CANCELLED');

    return slots.map((slot) => {
      if (slot.status === 'CANCELLED') {
        return { ...slot, hasConflict: false, overlapCount: 1 };
      }

      const slotStart = new Date(slot.startTime).getTime();
      const slotEnd = new Date(slot.endTime).getTime();

      // Find all active concurrent slots that overlap temporally
      const concurrentSlots = activeSlots.filter((other) => {
        const otherStart = new Date(other.startTime).getTime();
        const otherEnd = new Date(other.endTime).getTime();
        return slotStart < otherEnd && slotEnd > otherStart;
      });

      const overlapCount = concurrentSlots.length;

      // Check if there is a conflict on resource assignment (same therapist or room at same time)
      const hasConflict = concurrentSlots.some((other) => {
        if (other.id === slot.id) return false;

        const sameTherapist =
          slot.therapistId && other.therapistId && slot.therapistId === other.therapistId;
        const sameRoom = slot.roomId && other.roomId && slot.roomId === other.roomId;

        return Boolean(sameTherapist || sameRoom);
      });

      return {
        ...slot,
        hasConflict,
        overlapCount,
      };
    });
  }

  /**
   * Pure mapping function that processes appointments, therapist schedule blocks (vacations, breaks),
   * and room maintenance states into a unified array of CalendarSlotDTOs for a target date.
   */
  public static mapGridSlots(params: MapGridSlotsParams): CalendarSlotDTO[] {
    const { date, appointments, schedules = [], rooms = [], therapistId, roomId } = params;

    const dayStart = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0),
    );
    const dayEnd = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999),
    );

    const resultSlots: CalendarSlotDTO[] = [];

    // 1. Process Appointments
    const filteredAppointments = appointments.filter((appt) => {
      const apptStart = appt.timeRange.start.getTime();
      const apptEnd = appt.timeRange.end.getTime();

      // Check date boundary intersection
      const inDateRange = apptStart < dayEnd.getTime() && apptEnd > dayStart.getTime();
      if (!inDateRange) return false;

      // Check resource filters if provided
      if (therapistId && appt.therapistId !== therapistId) return false;
      if (roomId && appt.roomId !== roomId) return false;

      return true;
    });

    for (const appt of filteredAppointments) {
      resultSlots.push(CalendarGridMapper.mapAppointmentToSlot(appt));
    }

    // 2. Process Therapist Schedules (Vacations & Breaks)
    const targetSchedules = therapistId
      ? schedules.filter((s) => s.therapistId === therapistId)
      : schedules;

    for (const schedule of targetSchedules) {
      // Vacations
      for (const vacation of schedule.vacations) {
        const vStart = vacation.timeRange.start.getTime();
        const vEnd = vacation.timeRange.end.getTime();

        if (vStart < dayEnd.getTime() && vEnd > dayStart.getTime()) {
          resultSlots.push({
            id: `slot-vacation-${schedule.therapistId}-${vStart}`,
            startTime: vacation.timeRange.start.toISOString(),
            endTime: vacation.timeRange.end.toISOString(),
            status: 'VACATION',
            therapistId: schedule.therapistId,
            serviceType: vacation.title || 'Therapist Vacation',
            hasConflict: false,
            overlapCount: 1,
          });
        }
      }

      // Breaks
      for (const breakPeriod of schedule.breaks) {
        const props = breakPeriod.getValue();
        let bStart = 0;
        let bEnd = 0;
        let bStartIso = '';
        let bEndIso = '';

        if (props.timeRange) {
          bStart = props.timeRange.start.getTime();
          bEnd = props.timeRange.end.getTime();
          bStartIso = props.timeRange.start.toISOString();
          bEndIso = props.timeRange.end.toISOString();
        } else if (
          props.dayOfWeek !== undefined &&
          props.dayOfWeek === dayStart.getUTCDay() &&
          props.startMinute !== undefined &&
          props.endMinute !== undefined
        ) {
          const sDate = new Date(
            Date.UTC(
              dayStart.getUTCFullYear(),
              dayStart.getUTCMonth(),
              dayStart.getUTCDate(),
              Math.floor(props.startMinute / 60),
              props.startMinute % 60,
            ),
          );
          const eDate = new Date(
            Date.UTC(
              dayStart.getUTCFullYear(),
              dayStart.getUTCMonth(),
              dayStart.getUTCDate(),
              Math.floor(props.endMinute / 60),
              props.endMinute % 60,
            ),
          );
          bStart = sDate.getTime();
          bEnd = eDate.getTime();
          bStartIso = sDate.toISOString();
          bEndIso = eDate.toISOString();
        }

        if (bStart > 0 && bStart < dayEnd.getTime() && bEnd > dayStart.getTime()) {
          resultSlots.push({
            id: `slot-break-${schedule.therapistId}-${bStart}`,
            startTime: bStartIso,
            endTime: bEndIso,
            status: 'BLOCKED',
            therapistId: schedule.therapistId,
            serviceType: breakPeriod.title || 'Scheduled Break',
            hasConflict: false,
            overlapCount: 1,
          });
        }
      }
    }

    // 3. Process Rooms in Maintenance
    const targetRooms = roomId ? rooms.filter((r) => r.id.getValue() === roomId) : rooms;

    for (const room of targetRooms) {
      if (room.status === RoomStatus.MAINTENANCE) {
        resultSlots.push({
          id: `slot-maint-${room.id.getValue()}-${dayStart.getTime()}`,
          startTime: dayStart.toISOString(),
          endTime: dayEnd.toISOString(),
          status: 'MAINTENANCE',
          roomId: room.id.getValue(),
          serviceType: room.maintenanceReason || 'Facility Maintenance',
          hasConflict: false,
          overlapCount: 1,
        });
      }
    }

    // Compute conflict indicators & concurrent overlaps across all slots
    return CalendarGridMapper.computeConflicts(resultSlots);
  }
}
