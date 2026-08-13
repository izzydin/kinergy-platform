import { Appointment } from '../../../domain/appointment/appointment.aggregate';
import { AppointmentRepository } from '../../../domain/repositories/appointment.repository';
import { TestClock } from '../../../domain/shared/clock';
import {
  AppointmentType,
  AppointmentTypeEnum,
} from '../../../domain/value-objects/appointment-type.vo';
import { TimeRange } from '../../../domain/value-objects/time-range.vo';
import { DailyAgendaDTO } from '../dtos/daily-agenda.dto';
import { WeeklyAgendaDTO } from '../dtos/weekly-agenda.dto';
import { CalendarReadRepository } from '../repositories/calendar-read.repository';
import { GetDailyAgendaQuery } from '../queries/get-daily-agenda.query';
import { GetTodaysAppointmentsQuery } from '../queries/get-todays-appointments.query';
import { GetWeeklyAgendaQuery } from '../queries/get-weekly-agenda.query';
import { GetDailyAgendaHandler } from './get-daily-agenda.handler';
import { GetTodaysAppointmentsHandler } from './get-todays-appointments.handler';
import { GetWeeklyAgendaHandler, normalizeToStartOfWeek } from './get-weekly-agenda.handler';

describe('Calendar CQRS Query Handlers', () => {
  let mockApptRepo: jest.Mocked<AppointmentRepository>;
  let mockReadRepo: jest.Mocked<CalendarReadRepository>;
  let testClock: TestClock;

  const apptType = AppointmentType.create(AppointmentTypeEnum.TREATMENT);

  beforeEach(() => {
    testClock = new TestClock(new Date('2026-08-15T10:15:00.000Z'), 'UTC');

    mockApptRepo = {
      findById: jest.fn(),
      findConflictingAppointments: jest.fn(),
      findAppointmentsForTherapist: jest.fn(),
      findAppointmentsForRoom: jest.fn(),
      findAppointmentsForClient: jest.fn(),
      findAppointmentsByRange: jest.fn(),
      save: jest.fn(),
    };

    mockReadRepo = {
      getDailyAgenda: jest.fn(),
      getWeeklyAgenda: jest.fn(),
      getTherapistCalendar: jest.fn(),
      getRoomCalendar: jest.fn(),
      getReceptionDashboard: jest.fn(),
      getClientHistory: jest.fn(),
    };
  });

  describe('GetTodaysAppointmentsHandler', () => {
    it("fetches appointments for today's operational day using Clock.today() without state mutation", async () => {
      // Clock is set at 2026-08-15T10:15:00.000Z
      const appt1 = Appointment.create({
        clientId: 'client_1',
        therapistId: 'therapist_1',
        roomId: 'room_1',
        type: apptType,
        timeRange: TimeRange.create(
          new Date('2026-08-15T08:00:00.000Z'),
          new Date('2026-08-15T09:00:00.000Z'),
        ),
      });

      const appt2 = Appointment.create({
        clientId: 'client_2',
        therapistId: 'therapist_1',
        roomId: 'room_1',
        type: apptType,
        timeRange: TimeRange.create(
          new Date('2026-08-15T14:00:00.000Z'),
          new Date('2026-08-15T15:00:00.000Z'),
        ),
      });

      mockApptRepo.findAppointmentsByRange.mockResolvedValueOnce([appt1, appt2]);

      const handler = new GetTodaysAppointmentsHandler(mockApptRepo, testClock);
      const query = new GetTodaysAppointmentsQuery({ therapistId: 'therapist_1' });

      const result = await handler.execute(query);

      expect(result.isSuccess).toBe(true);
      const slots = result.getValue();
      expect(slots).toHaveLength(2);

      // Verify zero mutation invariant
      expect(mockApptRepo.save).not.toHaveBeenCalled();

      // Verify operational status tagging
      expect(slots[0]!.operationalStatus).toBe('PAST');
      expect(slots[1]!.operationalStatus).toBe('UPCOMING');
    });
  });

  describe('GetDailyAgendaHandler', () => {
    it('delegates to CalendarReadRepository when provided', async () => {
      const mockAgenda: DailyAgendaDTO = {
        date: '2026-08-15',
        totalAppointments: 1,
        summaryByStatus: { SCHEDULED: 1 },
        slots: [],
        appointmentsByTherapist: {},
        appointmentsByRoom: {},
      };

      mockReadRepo.getDailyAgenda.mockResolvedValueOnce(mockAgenda);

      const handler = new GetDailyAgendaHandler(mockReadRepo);
      const query = new GetDailyAgendaQuery({ date: '2026-08-15' });

      const result = await handler.execute(query);

      expect(result.isSuccess).toBe(true);
      expect(result.getValue()).toEqual(mockAgenda);
      expect(mockReadRepo.getDailyAgenda).toHaveBeenCalledWith(
        new Date('2026-08-15'),
        undefined,
        undefined,
      );
    });

    it('falls back to AppointmentRepository + ProjectionService when read repo is omitted', async () => {
      const appt = Appointment.create({
        clientId: 'client_1',
        therapistId: 'therapist_1',
        roomId: 'room_1',
        type: apptType,
        timeRange: TimeRange.create(
          new Date('2026-08-15T09:00:00.000Z'),
          new Date('2026-08-15T10:00:00.000Z'),
        ),
      });

      mockApptRepo.findAppointmentsByRange.mockResolvedValueOnce([appt]);

      const handler = new GetDailyAgendaHandler(undefined, mockApptRepo, testClock);
      const query = new GetDailyAgendaQuery({ date: '2026-08-15' });

      const result = await handler.execute(query);

      expect(result.isSuccess).toBe(true);
      const agenda = result.getValue();
      expect(agenda.date).toBe('2026-08-15');
      expect(agenda.totalAppointments).toBe(1);
    });
  });

  describe('GetWeeklyAgendaHandler', () => {
    it('normalizes target startDate to Monday 00:00 UTC start-of-week', () => {
      // Wednesday 2026-08-19 -> Monday 2026-08-17
      const wednesday = new Date('2026-08-19T15:30:00.000Z');
      const mondayNorm1 = normalizeToStartOfWeek(wednesday);
      expect(mondayNorm1.toISOString()).toBe('2026-08-17T00:00:00.000Z');

      // Sunday 2026-08-23 -> Monday 2026-08-17
      const sunday = new Date('2026-08-23T20:00:00.000Z');
      const mondayNorm2 = normalizeToStartOfWeek(sunday);
      expect(mondayNorm2.toISOString()).toBe('2026-08-17T00:00:00.000Z');
    });

    it('retrieves 7-day span and returns WeeklyAgendaDTO', async () => {
      const mockWeekly: WeeklyAgendaDTO = {
        startDate: '2026-08-17T00:00:00.000Z',
        endDate: '2026-08-23T23:59:59.999Z',
        totalAppointments: 3,
        dailyAgendas: [],
      };

      mockReadRepo.getWeeklyAgenda.mockResolvedValueOnce(mockWeekly);

      const handler = new GetWeeklyAgendaHandler(mockReadRepo);
      const query = new GetWeeklyAgendaQuery({ startDate: '2026-08-19' }); // Wednesday input

      const result = await handler.execute(query);

      expect(result.isSuccess).toBe(true);
      expect(result.getValue()).toEqual(mockWeekly);

      // Verify that handler normalized Wednesday to Monday start date
      expect(mockReadRepo.getWeeklyAgenda).toHaveBeenCalledWith(
        new Date('2026-08-17T00:00:00.000Z'),
        undefined,
        undefined,
      );
    });
  });
});
