import { Appointment } from '../../../domain/appointment/appointment.aggregate';
import { Room } from '../../../domain/room/room.aggregate';
import { AppointmentRepository } from '../../../domain/repositories/appointment.repository';
import { RoomRepository } from '../../../domain/repositories/room.repository';
import { TherapistScheduleRepository } from '../../../domain/repositories/therapist-schedule.repository';
import { Clock, SystemClock } from '../../../domain/shared/clock';
import { TherapistSchedule } from '../../../domain/therapist-schedule/therapist-schedule.aggregate';
import { TimeRange } from '../../../domain/value-objects/time-range.vo';
import { CalendarSlotDTO } from '../dtos/calendar-slot.dto';
import { DailyAgendaDTO } from '../dtos/daily-agenda.dto';
import { WeeklyAgendaDTO } from '../dtos/weekly-agenda.dto';
import { CalendarGridMapper, CalendarGridMapperOptions } from '../mappers/calendar-grid.mapper';

export interface ProjectDailyAgendaParams {
  readonly date: Date;
  readonly therapistId?: string;
  readonly roomId?: string;
  readonly timezone?: string;
  readonly appointments?: Appointment[];
  readonly schedules?: TherapistSchedule[];
  readonly rooms?: Room[];
  readonly options?: CalendarGridMapperOptions;
}

export interface ProjectWeeklyAgendaParams {
  readonly startDate: Date;
  readonly therapistId?: string;
  readonly roomId?: string;
  readonly timezone?: string;
  readonly appointments?: Appointment[];
  readonly schedules?: TherapistSchedule[];
  readonly rooms?: Room[];
  readonly options?: CalendarGridMapperOptions;
}

/**
 * Synchronous & Repository-Backed Calendar Projection Engine.
 * Projects domain entities (Appointments, TherapistSchedules, Rooms) into structured
 * daily and weekly operational agenda read-models tagged with real-time operational status.
 */
export class CalendarProjectionService {
  private readonly clock: Clock;
  private readonly appointmentRepo?: AppointmentRepository;
  private readonly scheduleRepo?: TherapistScheduleRepository;
  private readonly roomRepo?: RoomRepository;

  constructor(
    clock?: Clock,
    appointmentRepo?: AppointmentRepository,
    scheduleRepo?: TherapistScheduleRepository,
    roomRepo?: RoomRepository,
  ) {
    this.clock = clock ?? new SystemClock();
    this.appointmentRepo = appointmentRepo;
    this.scheduleRepo = scheduleRepo;
    this.roomRepo = roomRepo;
  }

  /**
   * Synchronously projects appointments, schedules, and rooms into a structured DailyAgendaDTO.
   * Tags every slot with real-time operational status (PAST, CURRENT_NOW, UPCOMING).
   */
  public projectDailyAgenda(params: ProjectDailyAgendaParams): DailyAgendaDTO {
    const {
      date,
      therapistId,
      roomId,
      appointments = [],
      schedules = [],
      rooms = [],
      options,
    } = params;

    // 1. Map raw entities to grid slots with conflict detection
    const rawSlots = CalendarGridMapper.mapGridSlots({
      date,
      appointments,
      schedules,
      rooms,
      therapistId,
      roomId,
      options,
    });

    // 2. Tag slots with real-time operational status using Clock
    const nowMs = this.clock.now().getTime();
    const slots: CalendarSlotDTO[] = rawSlots.map((slot) => {
      const startMs = new Date(slot.startTime).getTime();
      const endMs = new Date(slot.endTime).getTime();

      let operationalStatus: 'PAST' | 'CURRENT_NOW' | 'UPCOMING';
      if (endMs <= nowMs) {
        operationalStatus = 'PAST';
      } else if (startMs <= nowMs && nowMs < endMs) {
        operationalStatus = 'CURRENT_NOW';
      } else {
        operationalStatus = 'UPCOMING';
      }

      return {
        ...slot,
        operationalStatus,
      };
    });

    // 3. Compute total non-cancelled appointments
    const activeAppointmentSlots = slots.filter(
      (slot) => Boolean(slot.appointmentId) && slot.status !== 'CANCELLED',
    );
    const totalAppointments = activeAppointmentSlots.length;

    // 4. Compute status summary breakdown
    const summaryByStatus: Record<string, number> = {};
    for (const slot of slots) {
      summaryByStatus[slot.status] = (summaryByStatus[slot.status] || 0) + 1;
    }

    // 5. Group slots by therapist ID
    const appointmentsByTherapist: Record<string, CalendarSlotDTO[]> = {};
    for (const slot of slots) {
      if (slot.therapistId) {
        const tid = slot.therapistId;
        const list = appointmentsByTherapist[tid] ?? [];
        list.push(slot);
        appointmentsByTherapist[tid] = list;
      }
    }

    // 6. Group slots by room ID
    const appointmentsByRoom: Record<string, CalendarSlotDTO[]> = {};
    for (const slot of slots) {
      if (slot.roomId) {
        const rid = slot.roomId;
        const list = appointmentsByRoom[rid] ?? [];
        list.push(slot);
        appointmentsByRoom[rid] = list;
      }
    }

    // Format date as YYYY-MM-DD string
    const dateParts = date.toISOString().split('T');
    const dateString = dateParts[0] ?? '';

    return {
      date: dateString,
      totalAppointments,
      summaryByStatus,
      slots,
      appointmentsByTherapist,
      appointmentsByRoom,
    };
  }

  /**
   * Synchronously projects appointments, schedules, and rooms into a 7-day WeeklyAgendaDTO.
   */
  public projectWeeklyAgenda(params: ProjectWeeklyAgendaParams): WeeklyAgendaDTO {
    const { startDate, therapistId, roomId, timezone, appointments, schedules, rooms, options } =
      params;

    const dailyAgendas: DailyAgendaDTO[] = [];
    let totalAppointments = 0;

    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
      const currentDay = new Date(
        Date.UTC(
          startDate.getUTCFullYear(),
          startDate.getUTCMonth(),
          startDate.getUTCDate() + dayIndex,
          0,
          0,
          0,
          0,
        ),
      );

      const dailyAgenda = this.projectDailyAgenda({
        date: currentDay,
        therapistId,
        roomId,
        timezone,
        appointments,
        schedules,
        rooms,
        options,
      });

      dailyAgendas.push(dailyAgenda);
      totalAppointments += dailyAgenda.totalAppointments;
    }

    const startIso = startDate.toISOString();
    const endDate = new Date(
      Date.UTC(
        startDate.getUTCFullYear(),
        startDate.getUTCMonth(),
        startDate.getUTCDate() + 6,
        23,
        59,
        59,
        999,
      ),
    );
    const endIso = endDate.toISOString();

    return {
      startDate: startIso,
      endDate: endIso,
      totalAppointments,
      dailyAgendas,
    };
  }

  /**
   * Asynchronously fetches domain entities from injected repositories and projects DailyAgendaDTO.
   */
  public async fetchAndProjectDailyAgenda(
    date: Date,
    therapistId?: string,
    roomId?: string,
    timezone?: string,
  ): Promise<DailyAgendaDTO> {
    if (!this.appointmentRepo) {
      throw new Error(
        'AppointmentRepository is required for repository-backed daily agenda projection.',
      );
    }

    const dayStart = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0),
    );
    const dayEnd = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999),
    );
    const range = TimeRange.create(dayStart, dayEnd);

    const appointments = await this.appointmentRepo.findAppointmentsByRange(range, {
      therapistId,
      roomId,
    });

    let schedules: TherapistSchedule[] = [];
    if (this.scheduleRepo && therapistId) {
      const schedule = await this.scheduleRepo.findByTherapistId(therapistId);
      if (schedule) schedules = [schedule];
    }

    let rooms: Room[] = [];
    if (this.roomRepo && roomId) {
      const room = await this.roomRepo.findById(roomId);
      if (room) rooms = [room];
    } else if (this.roomRepo) {
      rooms = await this.roomRepo.findAll();
    }

    return this.projectDailyAgenda({
      date,
      therapistId,
      roomId,
      timezone,
      appointments,
      schedules,
      rooms,
    });
  }

  /**
   * Asynchronously fetches domain entities from injected repositories and projects WeeklyAgendaDTO.
   */
  public async fetchAndProjectWeeklyAgenda(
    startDate: Date,
    therapistId?: string,
    roomId?: string,
    timezone?: string,
  ): Promise<WeeklyAgendaDTO> {
    if (!this.appointmentRepo) {
      throw new Error(
        'AppointmentRepository is required for repository-backed weekly agenda projection.',
      );
    }

    const weekStart = new Date(
      Date.UTC(
        startDate.getUTCFullYear(),
        startDate.getUTCMonth(),
        startDate.getUTCDate(),
        0,
        0,
        0,
        0,
      ),
    );
    const weekEnd = new Date(
      Date.UTC(
        startDate.getUTCFullYear(),
        startDate.getUTCMonth(),
        startDate.getUTCDate() + 6,
        23,
        59,
        59,
        999,
      ),
    );
    const range = TimeRange.create(weekStart, weekEnd);

    const appointments = await this.appointmentRepo.findAppointmentsByRange(range, {
      therapistId,
      roomId,
    });

    let schedules: TherapistSchedule[] = [];
    if (this.scheduleRepo && therapistId) {
      const schedule = await this.scheduleRepo.findByTherapistId(therapistId);
      if (schedule) schedules = [schedule];
    }

    let rooms: Room[] = [];
    if (this.roomRepo && roomId) {
      const room = await this.roomRepo.findById(roomId);
      if (room) rooms = [room];
    } else if (this.roomRepo) {
      rooms = await this.roomRepo.findAll();
    }

    return this.projectWeeklyAgenda({
      startDate,
      therapistId,
      roomId,
      timezone,
      appointments,
      schedules,
      rooms,
    });
  }
}
