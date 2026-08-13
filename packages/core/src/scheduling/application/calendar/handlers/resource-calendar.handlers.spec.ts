import { Appointment } from '../../../domain/appointment/appointment.aggregate';
import { AppointmentRepository } from '../../../domain/repositories/appointment.repository';
import { RoomRepository } from '../../../domain/repositories/room.repository';
import { TherapistScheduleRepository } from '../../../domain/repositories/therapist-schedule.repository';
import { Room } from '../../../domain/room/room.aggregate';
import { RoomStatus } from '../../../domain/value-objects/room-status.enum';
import { TestClock } from '../../../domain/shared/clock';
import { TherapistSchedule } from '../../../domain/therapist-schedule/therapist-schedule.aggregate';
import {
  BreakPeriod,
  VacationPeriod,
  WorkingHours,
} from '../../../domain/therapist-schedule/value-objects';
import {
  AppointmentType,
  AppointmentTypeEnum,
} from '../../../domain/value-objects/appointment-type.vo';
import { TimeRange } from '../../../domain/value-objects/time-range.vo';
import { RoomCalendarDTO } from '../dtos/room-calendar.dto';
import { TherapistCalendarDTO } from '../dtos/therapist-calendar.dto';
import { CalendarReadRepository } from '../repositories/calendar-read.repository';
import { GetRoomCalendarQuery } from '../queries/get-room-calendar.query';
import { GetTherapistCalendarQuery } from '../queries/get-therapist-calendar.query';
import { GetRoomCalendarHandler } from './get-room-calendar.handler';
import { GetTherapistCalendarHandler } from './get-therapist-calendar.handler';

describe('Resource Calendar Handlers (Therapist & Room)', () => {
  let mockApptRepo: jest.Mocked<AppointmentRepository>;
  let mockScheduleRepo: jest.Mocked<TherapistScheduleRepository>;
  let mockRoomRepo: jest.Mocked<RoomRepository>;
  let mockReadRepo: jest.Mocked<CalendarReadRepository>;
  let testClock: TestClock;

  const apptType = AppointmentType.create(AppointmentTypeEnum.TREATMENT);
  const START_ISO = '2026-08-15T08:00:00.000Z';
  const END_ISO = '2026-08-15T18:00:00.000Z';

  beforeEach(() => {
    testClock = new TestClock(new Date('2026-08-15T10:00:00.000Z'), 'UTC');

    mockApptRepo = {
      findById: jest.fn(),
      findConflictingAppointments: jest.fn(),
      findAppointmentsForTherapist: jest.fn(),
      findAppointmentsForRoom: jest.fn(),
      findAppointmentsForClient: jest.fn(),
      findAppointmentsByRange: jest.fn(),
      save: jest.fn(),
    };

    mockScheduleRepo = {
      findByTherapistId: jest.fn(),
      save: jest.fn(),
    };

    mockRoomRepo = {
      findById: jest.fn(),
      findAvailableRooms: jest.fn(),
      findAll: jest.fn(),
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

  describe('GetTherapistCalendarHandler', () => {
    it('delegates to CalendarReadRepository when provided', async () => {
      const mockDTO: TherapistCalendarDTO = {
        therapistId: 'therapist_100',
        therapistName: 'Dr. Jane Smith',
        startDate: START_ISO,
        endDate: END_ISO,
        workingHours: [],
        breaks: [],
        vacations: [],
        overrides: [],
        appointments: [],
      };

      mockReadRepo.getTherapistCalendar.mockResolvedValueOnce(mockDTO);

      const handler = new GetTherapistCalendarHandler(mockReadRepo);
      const query = new GetTherapistCalendarQuery({
        therapistId: 'therapist_100',
        startTime: START_ISO,
        endTime: END_ISO,
      });

      const result = await handler.execute(query);

      expect(result.isSuccess).toBe(true);
      expect(result.getValue()).toEqual(mockDTO);
      expect(mockReadRepo.getTherapistCalendar).toHaveBeenCalledWith(
        'therapist_100',
        new Date(START_ISO),
        new Date(END_ISO),
      );
    });

    it('merges working shifts, breaks, vacations, and assigned bookings via domain repositories', async () => {
      const appt = Appointment.create({
        clientId: 'client_1',
        therapistId: 'therapist_100',
        roomId: 'room_1',
        type: apptType,
        timeRange: TimeRange.create(
          new Date('2026-08-15T09:00:00.000Z'),
          new Date('2026-08-15T10:00:00.000Z'),
        ),
      });

      const schedule = TherapistSchedule.create({
        therapistId: 'therapist_100',
        workingHours: [WorkingHours.create(6, 540, 1020)], // Saturday 09:00-17:00
        breaks: [
          BreakPeriod.createSpecific(
            TimeRange.create(
              new Date('2026-08-15T12:00:00.000Z'),
              new Date('2026-08-15T13:00:00.000Z'),
            ),
            'Lunch Break',
          ),
        ],
        vacations: [
          VacationPeriod.create(
            TimeRange.create(
              new Date('2026-08-20T00:00:00.000Z'),
              new Date('2026-08-25T23:59:59.000Z'),
            ),
            'Annual Leave',
          ),
        ],
      });

      mockApptRepo.findAppointmentsForTherapist.mockResolvedValueOnce([appt]);
      mockScheduleRepo.findByTherapistId.mockResolvedValueOnce(schedule);

      const handler = new GetTherapistCalendarHandler(
        undefined,
        mockApptRepo,
        mockScheduleRepo,
        testClock,
      );

      const query = new GetTherapistCalendarQuery({
        therapistId: 'therapist_100',
        startTime: START_ISO,
        endTime: END_ISO,
      });

      const result = await handler.execute(query);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.therapistId).toBe('therapist_100');
      expect(dto.appointments).toHaveLength(1);
      expect(dto.workingHours).toHaveLength(1);
      expect(dto.breaks).toHaveLength(1);
      expect(dto.vacations).toHaveLength(1);
    });
  });

  describe('GetRoomCalendarHandler', () => {
    it('delegates to CalendarReadRepository when provided', async () => {
      const mockDTO: RoomCalendarDTO = {
        roomId: 'room_5',
        roomName: 'Hydrotherapy Suite 1',
        status: 'AVAILABLE',
        capacity: 2,
        features: ['hydrotherapy-tub'],
        startDate: START_ISO,
        endDate: END_ISO,
        appointments: [],
      };

      mockReadRepo.getRoomCalendar.mockResolvedValueOnce(mockDTO);

      const handler = new GetRoomCalendarHandler(mockReadRepo);
      const query = new GetRoomCalendarQuery({
        roomId: 'room_5',
        startTime: START_ISO,
        endTime: END_ISO,
      });

      const result = await handler.execute(query);

      expect(result.isSuccess).toBe(true);
      expect(result.getValue()).toEqual(mockDTO);
      expect(mockReadRepo.getRoomCalendar).toHaveBeenCalledWith(
        'room_5',
        new Date(START_ISO),
        new Date(END_ISO),
      );
    });

    it('fetches room operational status, capacity, features, and occupancy via domain repositories', async () => {
      const appt = Appointment.create({
        clientId: 'client_2',
        therapistId: 'therapist_1',
        roomId: 'room_5',
        type: apptType,
        timeRange: TimeRange.create(
          new Date('2026-08-15T14:00:00.000Z'),
          new Date('2026-08-15T15:00:00.000Z'),
        ),
      });

      const room = Room.create({
        name: 'Cryotherapy Suite 1',
        capacity: 3,
        status: RoomStatus.AVAILABLE,
        features: ['cryo-chamber', 'oxygen-bar'],
      });

      mockApptRepo.findAppointmentsForRoom.mockResolvedValueOnce([appt]);
      mockRoomRepo.findById.mockResolvedValueOnce(room);

      const handler = new GetRoomCalendarHandler(undefined, mockApptRepo, mockRoomRepo, testClock);

      const query = new GetRoomCalendarQuery({
        roomId: 'room_5',
        startTime: START_ISO,
        endTime: END_ISO,
      });

      const result = await handler.execute(query);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.roomId).toBe('room_5');
      expect(dto.roomName).toBe('Cryotherapy Suite 1');
      expect(dto.capacity).toBe(3);
      expect(dto.features).toEqual(['cryo-chamber', 'oxygen-bar']);
      expect(dto.appointments).toHaveLength(1);
    });
  });
});
