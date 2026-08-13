import { Appointment } from '../../../domain/appointment/appointment.aggregate';
import { AppointmentId } from '../../../domain/appointment/appointment-id.vo';
import { AppointmentStatus } from '../../../domain/value-objects/appointment-status.enum';
import { AppointmentRepository } from '../../../domain/repositories/appointment.repository';
import { RoomRepository } from '../../../domain/repositories/room.repository';
import { Room } from '../../../domain/room/room.aggregate';
import { RoomStatus } from '../../../domain/value-objects/room-status.enum';
import { TestClock } from '../../../domain/shared/clock';
import {
  AppointmentType,
  AppointmentTypeEnum,
} from '../../../domain/value-objects/appointment-type.vo';
import { TimeRange } from '../../../domain/value-objects/time-range.vo';
import { ClientHistoryDTO } from '../dtos/client-history.dto';
import { ReceptionDashboardDTO } from '../dtos/reception-dashboard.dto';
import { CalendarReadRepository } from '../repositories/calendar-read.repository';
import { GetClientHistoryQuery } from '../queries/get-client-history.query';
import { GetReceptionDashboardQuery } from '../queries/get-reception-dashboard.query';
import { GetUpcomingAppointmentsQuery } from '../queries/get-upcoming-appointments.query';
import { GetClientHistoryHandler } from './get-client-history.handler';
import { GetReceptionDashboardHandler } from './get-reception-dashboard.handler';
import { GetUpcomingAppointmentsHandler } from './get-upcoming-appointments.handler';

describe('Reception Dashboard & Live Feed Handlers', () => {
  let mockApptRepo: jest.Mocked<AppointmentRepository>;
  let mockRoomRepo: jest.Mocked<RoomRepository>;
  let mockReadRepo: jest.Mocked<CalendarReadRepository>;
  let testClock: TestClock;

  const apptType = AppointmentType.create(AppointmentTypeEnum.TREATMENT);

  beforeEach(() => {
    // Current test clock: 2026-08-15T10:00:00.000Z
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

  describe('GetReceptionDashboardHandler', () => {
    it('delegates to CalendarReadRepository when provided', async () => {
      const mockDTO: ReceptionDashboardDTO = {
        date: '2026-08-15',
        liveFeed: [],
        pendingCheckIns: [],
        activeInProgress: [],
        roomUtilizationRates: {},
        operationalAlerts: [],
      };

      mockReadRepo.getReceptionDashboard.mockResolvedValueOnce(mockDTO);

      const handler = new GetReceptionDashboardHandler(mockReadRepo);
      const query = new GetReceptionDashboardQuery({ date: '2026-08-15' });

      const result = await handler.execute(query);

      expect(result.isSuccess).toBe(true);
      expect(result.getValue()).toEqual(mockDTO);
    });

    it('aggregates live counters, pending check-ins, room occupancy, and actionable alerts', async () => {
      // Clock is 10:00 UTC
      // Appt 1: 10:10 - 11:00 (Starts in 10 mins -> Pending Check-In Alert)
      const apptPending = Appointment.create({
        clientId: 'client_10',
        therapistId: 'therapist_1',
        roomId: 'room_101',
        type: apptType,
        timeRange: TimeRange.create(
          new Date('2026-08-15T10:10:00.000Z'),
          new Date('2026-08-15T11:00:00.000Z'),
        ),
      });

      const room = Room.create({
        name: 'Treatment Room 101',
        capacity: 1,
        status: RoomStatus.AVAILABLE,
      });

      mockApptRepo.findAppointmentsByRange.mockResolvedValueOnce([apptPending]);
      mockRoomRepo.findAll.mockResolvedValueOnce([room]);

      const handler = new GetReceptionDashboardHandler(
        undefined,
        mockApptRepo,
        mockRoomRepo,
        testClock,
      );

      const query = new GetReceptionDashboardQuery({ date: '2026-08-15' });
      const result = await handler.execute(query);

      expect(result.isSuccess).toBe(true);
      const dashboard = result.getValue();
      expect(dashboard.date).toBe('2026-08-15');
      expect(dashboard.pendingCheckIns).toHaveLength(1);
      expect(dashboard.operationalAlerts).toHaveLength(1);
      expect(dashboard.operationalAlerts[0]).toContain(
        'starting in 10 mins needs front-desk check-in',
      );
    });
  });

  describe('GetUpcomingAppointmentsHandler', () => {
    it('retrieves next N upcoming appointments starting from Clock.now()', async () => {
      // Clock is 10:00 UTC
      const appt1 = Appointment.create({
        clientId: 'client_1',
        therapistId: 'therapist_1',
        roomId: 'room_1',
        type: apptType,
        timeRange: TimeRange.create(
          new Date('2026-08-15T11:00:00.000Z'),
          new Date('2026-08-15T12:00:00.000Z'),
        ),
      });

      const appt2 = Appointment.create({
        clientId: 'client_2',
        therapistId: 'therapist_2',
        roomId: 'room_2',
        type: apptType,
        timeRange: TimeRange.create(
          new Date('2026-08-15T14:00:00.000Z'),
          new Date('2026-08-15T15:00:00.000Z'),
        ),
      });

      mockApptRepo.findAppointmentsByRange.mockResolvedValueOnce([appt1, appt2]);

      const handler = new GetUpcomingAppointmentsHandler(mockApptRepo, testClock);
      const query = new GetUpcomingAppointmentsQuery({ limit: 1 });

      const result = await handler.execute(query);

      expect(result.isSuccess).toBe(true);
      const slots = result.getValue();
      expect(slots).toHaveLength(1); // Limit 1
      expect(slots[0]!.clientId).toBe('client_1');
      expect(slots[0]!.operationalStatus).toBe('UPCOMING');
    });
  });

  describe('GetClientHistoryHandler', () => {
    it('delegates to CalendarReadRepository when provided', async () => {
      const mockHistory: ClientHistoryDTO = {
        clientId: 'client_99',
        clientName: 'Alice Johnson',
        totalBookings: 5,
        completedCount: 4,
        cancelledCount: 1,
        noShowCount: 0,
        complianceRate: 80.0,
        appointments: [],
      };

      mockReadRepo.getClientHistory.mockResolvedValueOnce(mockHistory);

      const handler = new GetClientHistoryHandler(mockReadRepo);
      const query = new GetClientHistoryQuery({ clientId: 'client_99' });

      const result = await handler.execute(query);

      expect(result.isSuccess).toBe(true);
      expect(result.getValue()).toEqual(mockHistory);
    });

    it('calculates total bookings and attendance compliance rate from appointment history', async () => {
      const apptCompleted = Appointment.reconstitute({
        id: AppointmentId.create('appt_comp'),
        version: 1,
        status: AppointmentStatus.COMPLETED,
        type: apptType,
        clientId: 'client_99',
        therapistId: 'therapist_1',
        roomId: 'room_1',
        timeRange: TimeRange.create(
          new Date('2026-08-01T10:00:00.000Z'),
          new Date('2026-08-01T11:00:00.000Z'),
        ),
        createdAt: new Date('2026-08-01T09:00:00.000Z'),
        updatedAt: new Date('2026-08-01T11:00:00.000Z'),
      });

      const apptNoShow = Appointment.create({
        clientId: 'client_99',
        therapistId: 'therapist_1',
        roomId: 'room_1',
        type: apptType,
        timeRange: TimeRange.create(
          new Date('2026-08-05T10:00:00.000Z'),
          new Date('2026-08-05T11:00:00.000Z'),
        ),
      });
      apptNoShow.markNoShow('Client absent', testClock);

      mockApptRepo.findAppointmentsForClient.mockResolvedValueOnce([apptCompleted, apptNoShow]);

      const handler = new GetClientHistoryHandler(undefined, mockApptRepo, testClock);
      const query = new GetClientHistoryQuery({ clientId: 'client_99' });

      const result = await handler.execute(query);

      expect(result.isSuccess).toBe(true);
      const history = result.getValue();
      expect(history.clientId).toBe('client_99');
      expect(history.totalBookings).toBe(2);
      expect(history.completedCount).toBe(1);
      expect(history.noShowCount).toBe(1);
      expect(history.complianceRate).toBe(50.0); // 1 completed out of 2 finished = 50%
    });
  });
});
