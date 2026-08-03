import { GetAppointmentByIdHandler } from './get-appointment-by-id.handler';
import { FindAppointmentsByRangeHandler } from './find-appointments-by-range.handler';
import { GetReceptionDailyScheduleHandler } from './get-reception-daily-schedule.handler';
import { GetAppointmentByIdQuery } from '../queries/get-appointment-by-id.query';
import { FindAppointmentsByRangeQuery } from '../queries/find-appointments-by-range.query';
import { GetReceptionDailyScheduleQuery } from '../queries/get-reception-daily-schedule.query';
import { AppointmentRepository } from '../../../domain/repositories/appointment.repository';
import { TestClock } from '../../../domain/shared/clock';
import { Appointment } from '../../../domain/appointment/appointment.aggregate';
import {
  AppointmentType,
  AppointmentTypeEnum,
} from '../../../domain/value-objects/appointment-type.vo';
import { TimeRange } from '../../../domain/value-objects/time-range.vo';
import { AppointmentId } from '../../../domain/appointment/appointment-id.vo';

describe('Query Handlers', () => {
  let mockApptRepo: jest.Mocked<AppointmentRepository>;
  const clock = new TestClock(new Date('2026-08-03T10:00:00.000Z'));
  const apptType = AppointmentType.create(AppointmentTypeEnum.TREATMENT);
  const timeRange = TimeRange.create(
    new Date('2026-08-03T11:00:00.000Z'),
    new Date('2026-08-03T12:00:00.000Z'),
  );

  beforeEach(() => {
    mockApptRepo = {
      findById: jest.fn(),
      findAppointmentsByRange: jest.fn(),
      save: jest.fn(),
      findConflictingAppointments: jest.fn(),
      findAppointmentsForTherapist: jest.fn(),
      findAppointmentsForRoom: jest.fn(),
      findAppointmentsForClient: jest.fn(),
    };
  });

  describe('GetAppointmentByIdHandler', () => {
    it('should return appointment DTO when appointment exists', async () => {
      const appt = Appointment.create(
        {
          id: AppointmentId.create('appt_123'),
          clientId: 'client_1',
          therapistId: 'therapist_1',
          roomId: 'room_1',
          type: apptType,
          timeRange,
        },
        clock,
      );

      mockApptRepo.findById.mockResolvedValueOnce(appt);
      const handler = new GetAppointmentByIdHandler(mockApptRepo);
      const query = new GetAppointmentByIdQuery({ appointmentId: 'appt_123' });

      const result = await handler.execute(query);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.id).toBe('appt_123');
      expect(dto.clientId).toBe('client_1');
    });

    it('should return failure when appointment does not exist', async () => {
      mockApptRepo.findById.mockResolvedValueOnce(null);
      const handler = new GetAppointmentByIdHandler(mockApptRepo);
      const query = new GetAppointmentByIdQuery({ appointmentId: 'non_existent' });

      const result = await handler.execute(query);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toContain('not found');
    });
  });

  describe('FindAppointmentsByRangeHandler', () => {
    it('should return array of appointment DTOs matching search options', async () => {
      const appt1 = Appointment.create(
        {
          id: AppointmentId.create('appt_1'),
          clientId: 'client_1',
          therapistId: 'therapist_1',
          roomId: 'room_1',
          type: apptType,
          timeRange,
        },
        clock,
      );

      mockApptRepo.findAppointmentsByRange.mockResolvedValueOnce([appt1]);
      const handler = new FindAppointmentsByRangeHandler(mockApptRepo);

      const query = new FindAppointmentsByRangeQuery({
        startTime: '2026-08-03T00:00:00.000Z',
        endTime: '2026-08-03T23:59:59.000Z',
        therapistId: 'therapist_1',
      });

      const result = await handler.execute(query);

      expect(result.isSuccess).toBe(true);
      const items = result.getValue();
      expect(items).toHaveLength(1);
      expect(items[0]?.id).toBe('appt_1');
    });
  });

  describe('GetReceptionDailyScheduleHandler', () => {
    it('should categorize daily schedule by therapist, room, and status counts', async () => {
      const appt1 = Appointment.create(
        {
          id: AppointmentId.create('appt_1'),
          clientId: 'client_1',
          therapistId: 'therapist_A',
          roomId: 'room_X',
          type: apptType,
          timeRange,
        },
        clock,
      );

      const appt2 = Appointment.create(
        {
          id: AppointmentId.create('appt_2'),
          clientId: 'client_2',
          therapistId: 'therapist_A',
          roomId: 'room_Y',
          type: apptType,
          timeRange,
        },
        clock,
      );

      mockApptRepo.findAppointmentsByRange.mockResolvedValueOnce([appt1, appt2]);
      const handler = new GetReceptionDailyScheduleHandler(mockApptRepo);

      const query = new GetReceptionDailyScheduleQuery({
        date: '2026-08-03',
      });

      const result = await handler.execute(query);

      expect(result.isSuccess).toBe(true);
      const schedule = result.getValue();

      expect(schedule.date).toBe('2026-08-03');
      expect(schedule.totalAppointments).toBe(2);
      expect(schedule.appointmentsByTherapist['therapist_A']?.length).toBe(2);
      expect(schedule.appointmentsByRoom['room_X']?.length).toBe(1);
      expect(schedule.appointmentsByRoom['room_Y']?.length).toBe(1);
      expect(schedule.summaryByStatus['SCHEDULED']).toBe(2);
    });
  });
});
