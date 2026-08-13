import { Appointment } from '../../domain/appointment/appointment.aggregate';
import { AppointmentId } from '../../domain/appointment/appointment-id.vo';
import { AppointmentStatus } from '../../domain/value-objects/appointment-status.enum';
import {
  AppointmentType,
  AppointmentTypeEnum,
} from '../../domain/value-objects/appointment-type.vo';
import { TimeRange } from '../../domain/value-objects/time-range.vo';
import { Room } from '../../domain/room/room.aggregate';
import { RoomId } from '../../domain/room/room-id.vo';
import { RoomStatus } from '../../domain/value-objects/room-status.enum';
import { TherapistSchedule } from '../../domain/therapist-schedule/therapist-schedule.aggregate';
import { WorkingHours } from '../../domain/therapist-schedule/value-objects/working-hours.vo';
import { BreakPeriod } from '../../domain/therapist-schedule/value-objects/break-period.vo';
import { TestClock } from '../../domain/shared/clock';

import {
  AppointmentRepository,
  FindAppointmentsOptions,
} from '../../domain/repositories/appointment.repository';
import { RoomRepository } from '../../domain/repositories/room.repository';
import { TherapistScheduleRepository } from '../../domain/repositories/therapist-schedule.repository';

import { CalendarGridMapper } from './mappers/calendar-grid.mapper';

import { GetTodaysAppointmentsHandler } from './handlers/get-todays-appointments.handler';
import { GetDailyAgendaHandler } from './handlers/get-daily-agenda.handler';
import { GetWeeklyAgendaHandler } from './handlers/get-weekly-agenda.handler';
import { GetTherapistCalendarHandler } from './handlers/get-therapist-calendar.handler';
import { GetRoomCalendarHandler } from './handlers/get-room-calendar.handler';
import { GetReceptionDashboardHandler } from './handlers/get-reception-dashboard.handler';
import { GetUpcomingAppointmentsHandler } from './handlers/get-upcoming-appointments.handler';
import { GetClientHistoryHandler } from './handlers/get-client-history.handler';

import { GetTodaysAppointmentsQuery } from './queries/get-todays-appointments.query';
import { GetDailyAgendaQuery } from './queries/get-daily-agenda.query';
import { GetWeeklyAgendaQuery } from './queries/get-weekly-agenda.query';
import { GetTherapistCalendarQuery } from './queries/get-therapist-calendar.query';
import { GetRoomCalendarQuery } from './queries/get-room-calendar.query';
import { GetReceptionDashboardQuery } from './queries/get-reception-dashboard.query';
import { GetUpcomingAppointmentsQuery } from './queries/get-upcoming-appointments.query';
import { GetClientHistoryQuery } from './queries/get-client-history.query';

class InMemoryAppointmentRepository implements AppointmentRepository {
  private appointments = new Map<string, Appointment>();

  public async findById(id: AppointmentId | string): Promise<Appointment | null> {
    const key = typeof id === 'string' ? id : id.toString();
    return this.appointments.get(key) ?? null;
  }

  public async findConflictingAppointments(
    therapistId: string,
    roomId: string,
    clientId: string,
    timeRange: TimeRange,
    excludeAppointmentId?: string,
  ): Promise<Appointment[]> {
    return Array.from(this.appointments.values()).filter((appt) => {
      if (excludeAppointmentId && appt.id.getValue() === excludeAppointmentId) {
        return false;
      }
      if (appt.status === AppointmentStatus.CANCELLED) {
        return false;
      }
      const matchesResource =
        appt.therapistId === therapistId || appt.roomId === roomId || appt.clientId === clientId;
      return matchesResource && appt.timeRange.overlaps(timeRange);
    });
  }

  public async findAppointmentsForTherapist(
    therapistId: string,
    timeRange: TimeRange,
  ): Promise<Appointment[]> {
    return Array.from(this.appointments.values()).filter(
      (appt) => appt.therapistId === therapistId && appt.timeRange.overlaps(timeRange),
    );
  }

  public async findAppointmentsForRoom(
    roomId: string,
    timeRange: TimeRange,
  ): Promise<Appointment[]> {
    return Array.from(this.appointments.values()).filter(
      (appt) => appt.roomId === roomId && appt.timeRange.overlaps(timeRange),
    );
  }

  public async findAppointmentsForClient(
    clientId: string,
    timeRange: TimeRange,
  ): Promise<Appointment[]> {
    return Array.from(this.appointments.values()).filter(
      (appt) => appt.clientId === clientId && appt.timeRange.overlaps(timeRange),
    );
  }

  public async findAppointmentsByRange(
    timeRange: TimeRange,
    options?: FindAppointmentsOptions,
  ): Promise<Appointment[]> {
    return Array.from(this.appointments.values()).filter((appt) => {
      if (!appt.timeRange.overlaps(timeRange)) return false;
      if (options?.therapistId && appt.therapistId !== options.therapistId) return false;
      if (options?.roomId && appt.roomId !== options.roomId) return false;
      if (options?.clientId && appt.clientId !== options.clientId) return false;
      if (options?.status && appt.status !== options.status) return false;
      return true;
    });
  }

  public async save(appointment: Appointment): Promise<void> {
    this.appointments.set(appointment.id.getValue(), appointment);
  }
}

class InMemoryTherapistScheduleRepository implements TherapistScheduleRepository {
  private schedules = new Map<string, TherapistSchedule>();

  public async findByTherapistId(therapistId: string): Promise<TherapistSchedule | null> {
    return this.schedules.get(therapistId) ?? null;
  }

  public async save(schedule: TherapistSchedule): Promise<void> {
    this.schedules.set(schedule.therapistId, schedule);
  }
}

class InMemoryRoomRepository implements RoomRepository {
  private rooms = new Map<string, Room>();

  public async findById(id: RoomId | string): Promise<Room | null> {
    const key = typeof id === 'string' ? id : id.toString();
    return this.rooms.get(key) ?? null;
  }

  public async findAvailableRooms(): Promise<Room[]> {
    return Array.from(this.rooms.values()).filter((room) => room.status === RoomStatus.AVAILABLE);
  }

  public async findAll(): Promise<Room[]> {
    return Array.from(this.rooms.values());
  }

  public async save(room: Room): Promise<void> {
    this.rooms.set(room.id.getValue(), room);
  }
}

describe('Calendar Read-Model Integration Tests (CQRS Query Side)', () => {
  let apptRepo: InMemoryAppointmentRepository;
  let scheduleRepo: InMemoryTherapistScheduleRepository;
  let roomRepo: InMemoryRoomRepository;
  let testClock: TestClock;

  const apptType = AppointmentType.create(AppointmentTypeEnum.TREATMENT);

  beforeEach(() => {
    // Test Clock fixed at 2026-08-15T10:00:00.000Z
    testClock = new TestClock(new Date('2026-08-15T10:00:00.000Z'), 'UTC');
    apptRepo = new InMemoryAppointmentRepository();
    scheduleRepo = new InMemoryTherapistScheduleRepository();
    roomRepo = new InMemoryRoomRepository();
  });

  describe('1. Daily Grid Alignment Test', () => {
    it('correctly occupies 30-minute interval slots for appointments spanning hour boundaries (09:30 - 10:30)', () => {
      const date = new Date('2026-08-15T00:00:00.000Z');
      const slots = CalendarGridMapper.generateTimeSlots(date, {
        intervalMinutes: 30,
        startHour: 9,
        endHour: 11,
      });

      // 9:00, 9:30, 10:00, 10:30 (4 slots)
      expect(slots).toHaveLength(4);
      expect(slots[1]!.startTime.toISOString()).toContain('09:30');
      expect(slots[1]!.endTime.toISOString()).toContain('10:00');
      expect(slots[2]!.startTime.toISOString()).toContain('10:00');
      expect(slots[2]!.endTime.toISOString()).toContain('10:30');

      const apptSpanning = Appointment.create({
        clientId: 'client_span',
        therapistId: 'therapist_span',
        roomId: 'room_span',
        type: apptType,
        timeRange: TimeRange.create(
          new Date('2026-08-15T09:30:00.000Z'),
          new Date('2026-08-15T10:30:00.000Z'),
        ),
      });

      const mappedSlots = CalendarGridMapper.mapGridSlots({
        date,
        appointments: [apptSpanning],
        options: {
          intervalMinutes: 30,
          startHour: 9,
          endHour: 11,
        },
      });

      const apptRange = apptSpanning.timeRange;
      const overlappingSlots = slots.filter((slot) => {
        const slotRange = TimeRange.create(slot.startTime, slot.endTime);
        return slotRange.overlaps(apptRange);
      });

      // Appointment starting at 09:30 and ending at 10:30 spans 2 consecutive 30-min grid interval slots (09:30-10:00 and 10:00-10:30)
      expect(overlappingSlots).toHaveLength(2);
      expect(overlappingSlots[0]!.startTime.toISOString()).toContain('09:30');
      expect(overlappingSlots[1]!.startTime.toISOString()).toContain('10:00');

      expect(mappedSlots).toHaveLength(1);
      expect(mappedSlots[0]!.appointmentId).toBe(apptSpanning.id.getValue());
      expect(mappedSlots[0]!.startTime).toContain('09:30');
      expect(mappedSlots[0]!.endTime).toContain('10:30');
    });
  });

  describe('2. Multi-Resource Filtering Test', () => {
    it('excludes unassigned appointments when filtering by therapistId or roomId', async () => {
      const appt1 = Appointment.create({
        clientId: 'c1',
        therapistId: 'therapist_A',
        roomId: 'room_101',
        type: apptType,
        timeRange: TimeRange.create(
          new Date('2026-08-15T09:00:00.000Z'),
          new Date('2026-08-15T10:00:00.000Z'),
        ),
      });

      const appt2 = Appointment.create({
        clientId: 'c2',
        therapistId: 'therapist_B',
        roomId: 'room_101',
        type: apptType,
        timeRange: TimeRange.create(
          new Date('2026-08-15T11:00:00.000Z'),
          new Date('2026-08-15T12:00:00.000Z'),
        ),
      });

      const appt3 = Appointment.create({
        clientId: 'c3',
        therapistId: 'therapist_A',
        roomId: 'room_102',
        type: apptType,
        timeRange: TimeRange.create(
          new Date('2026-08-15T13:00:00.000Z'),
          new Date('2026-08-15T14:00:00.000Z'),
        ),
      });

      await apptRepo.save(appt1);
      await apptRepo.save(appt2);
      await apptRepo.save(appt3);

      const dailyHandler = new GetDailyAgendaHandler(undefined, apptRepo, testClock);
      const queryTherapistA = new GetDailyAgendaQuery({
        date: '2026-08-15',
        therapistId: 'therapist_A',
      });

      const resultTherapistA = await dailyHandler.execute(queryTherapistA);
      expect(resultTherapistA.isSuccess).toBe(true);
      const agendaA = resultTherapistA.getValue();
      expect(agendaA.totalAppointments).toBe(2);
      expect(agendaA.slots.find((s) => s.therapistId === 'therapist_B')).toBeUndefined();

      const roomHandler = new GetRoomCalendarHandler(undefined, apptRepo, roomRepo, testClock);
      const queryRoom102 = new GetRoomCalendarQuery({
        roomId: 'room_102',
        startTime: '2026-08-15T00:00:00.000Z',
        endTime: '2026-08-15T23:59:59.000Z',
      });

      const resultRoom102 = await roomHandler.execute(queryRoom102);
      expect(resultRoom102.isSuccess).toBe(true);
      const roomCal102 = resultRoom102.getValue();
      expect(roomCal102.appointments).toHaveLength(1);
      expect(roomCal102.appointments[0]!.appointmentId).toBe(appt3.id.getValue());
    });
  });

  describe('3. Timezone Boundary Test', () => {
    it('correctly projects agendas when requested with explicit timezone parameters', async () => {
      const appt = Appointment.create({
        clientId: 'c_tz',
        therapistId: 't_tz',
        roomId: 'r_tz',
        type: apptType,
        timeRange: TimeRange.create(
          new Date('2026-08-15T14:00:00.000Z'),
          new Date('2026-08-15T15:00:00.000Z'),
        ),
      });
      await apptRepo.save(appt);

      const handler = new GetDailyAgendaHandler(undefined, apptRepo, testClock);
      const query = new GetDailyAgendaQuery({
        date: '2026-08-15',
        timezone: 'America/La_Paz',
      });

      const result = await handler.execute(query);
      expect(result.isSuccess).toBe(true);
      const agenda = result.getValue();
      expect(agenda.date).toBe('2026-08-15');
      expect(agenda.totalAppointments).toBe(1);
    });
  });

  describe('4. Reception Alert Calculation Test', () => {
    it('flags urgent pending check-in alerts for appointments starting in <= 15 mins or past start time', async () => {
      // Clock is fixed at 10:00 UTC
      // Appt 1: 09:45 - 10:45 (Overdue check-in by 15 mins)
      const apptOverdue = Appointment.create({
        clientId: 'client_overdue',
        therapistId: 't_rec',
        roomId: 'r_rec',
        type: apptType,
        timeRange: TimeRange.create(
          new Date('2026-08-15T09:45:00.000Z'),
          new Date('2026-08-15T10:45:00.000Z'),
        ),
      });

      // Appt 2: 10:10 - 11:10 (Starts in 10 mins, pending check-in)
      const apptUpcoming = Appointment.create({
        clientId: 'client_soon',
        therapistId: 't_rec',
        roomId: 'r_rec',
        type: apptType,
        timeRange: TimeRange.create(
          new Date('2026-08-15T10:10:00.000Z'),
          new Date('2026-08-15T11:10:00.000Z'),
        ),
      });

      // Appt 3: 15:00 - 16:00 (Starts in 5 hours, non-urgent)
      const apptLater = Appointment.create({
        clientId: 'client_later',
        therapistId: 't_rec',
        roomId: 'r_rec',
        type: apptType,
        timeRange: TimeRange.create(
          new Date('2026-08-15T15:00:00.000Z'),
          new Date('2026-08-15T16:00:00.000Z'),
        ),
      });

      await apptRepo.save(apptOverdue);
      await apptRepo.save(apptUpcoming);
      await apptRepo.save(apptLater);

      const room = Room.create({
        name: 'VIP Suite 1',
        capacity: 2,
        status: RoomStatus.AVAILABLE,
      });
      await roomRepo.save(room);

      const receptionHandler = new GetReceptionDashboardHandler(
        undefined,
        apptRepo,
        roomRepo,
        testClock,
      );

      const query = new GetReceptionDashboardQuery({ date: '2026-08-15' });
      const result = await receptionHandler.execute(query);

      expect(result.isSuccess).toBe(true);
      const dashboard = result.getValue();

      expect(dashboard.pendingCheckIns).toHaveLength(2);
      expect(dashboard.operationalAlerts).toHaveLength(2);
      expect(dashboard.operationalAlerts[0]).toContain('past start time');
      expect(dashboard.operationalAlerts[1]).toContain('starting in 10 mins');
    });
  });

  describe('5. Full CQRS Read Pipeline & Zero Side-Effect Verification', () => {
    it('executes all 8 query handlers without mutating repository state', async () => {
      const appt = Appointment.create({
        clientId: 'client_cqrs',
        therapistId: 'therapist_cqrs',
        roomId: 'room_cqrs',
        type: apptType,
        timeRange: TimeRange.create(
          new Date('2026-08-15T10:00:00.000Z'),
          new Date('2026-08-15T11:00:00.000Z'),
        ),
      });
      await apptRepo.save(appt);

      const schedule = TherapistSchedule.create({
        therapistId: 'therapist_cqrs',
        workingHours: [WorkingHours.create(6, 540, 1020)],
        breaks: [
          BreakPeriod.createSpecific(
            TimeRange.create(
              new Date('2026-08-15T12:00:00.000Z'),
              new Date('2026-08-15T13:00:00.000Z'),
            ),
            'Lunch',
          ),
        ],
      });
      await scheduleRepo.save(schedule);

      const room = Room.create({
        name: 'Suite CQRS',
        capacity: 1,
        status: RoomStatus.AVAILABLE,
      });
      await roomRepo.save(room);

      const hToday = new GetTodaysAppointmentsHandler(apptRepo, testClock);
      const hDaily = new GetDailyAgendaHandler(undefined, apptRepo, testClock);
      const hWeekly = new GetWeeklyAgendaHandler(undefined, apptRepo, testClock);
      const hTherapist = new GetTherapistCalendarHandler(
        undefined,
        apptRepo,
        scheduleRepo,
        testClock,
      );
      const hRoom = new GetRoomCalendarHandler(undefined, apptRepo, roomRepo, testClock);
      const hReception = new GetReceptionDashboardHandler(undefined, apptRepo, roomRepo, testClock);
      const hUpcoming = new GetUpcomingAppointmentsHandler(apptRepo, testClock);
      const hClient = new GetClientHistoryHandler(undefined, apptRepo, testClock);

      const resToday = await hToday.execute(new GetTodaysAppointmentsQuery());
      const resDaily = await hDaily.execute(new GetDailyAgendaQuery({ date: '2026-08-15' }));
      const resWeekly = await hWeekly.execute(
        new GetWeeklyAgendaQuery({ startDate: '2026-08-15' }),
      );
      const resTherapist = await hTherapist.execute(
        new GetTherapistCalendarQuery({
          therapistId: 'therapist_cqrs',
          startTime: '2026-08-15T00:00:00.000Z',
          endTime: '2026-08-15T23:59:59.000Z',
        }),
      );
      const resRoom = await hRoom.execute(
        new GetRoomCalendarQuery({
          roomId: room.id.getValue(),
          startTime: '2026-08-15T00:00:00.000Z',
          endTime: '2026-08-15T23:59:59.000Z',
        }),
      );
      const resReception = await hReception.execute(
        new GetReceptionDashboardQuery({ date: '2026-08-15' }),
      );
      const resUpcoming = await hUpcoming.execute(new GetUpcomingAppointmentsQuery({ limit: 5 }));
      const resClient = await hClient.execute(
        new GetClientHistoryQuery({ clientId: 'client_cqrs' }),
      );

      expect(resToday.isSuccess).toBe(true);
      expect(resDaily.isSuccess).toBe(true);
      expect(resWeekly.isSuccess).toBe(true);
      expect(resTherapist.isSuccess).toBe(true);
      expect(resRoom.isSuccess).toBe(true);
      expect(resReception.isSuccess).toBe(true);
      expect(resUpcoming.isSuccess).toBe(true);
      expect(resClient.isSuccess).toBe(true);

      // Verify zero mutation: state remains unchanged
      const reloadedAppt = await apptRepo.findById(appt.id);
      expect(reloadedAppt).not.toBeNull();
      expect(reloadedAppt!.status).toBe(AppointmentStatus.SCHEDULED);
      expect(reloadedAppt!.version).toBe(1);
    });
  });
});
