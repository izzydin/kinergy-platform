import { ConfirmAppointmentHandler } from './confirm-appointment.handler';
import { CheckInAppointmentHandler } from './check-in-appointment.handler';
import { CompleteAppointmentHandler } from './complete-appointment.handler';
import { MarkNoShowHandler } from './mark-no-show.handler';
import { ConfirmAppointmentCommand } from '../commands/confirm-appointment.command';
import { CheckInAppointmentCommand } from '../commands/check-in-appointment.command';
import { CompleteAppointmentCommand } from '../commands/complete-appointment.command';
import { MarkNoShowCommand } from '../commands/mark-no-show.command';
import { AppointmentRepository } from '../../../domain/repositories/appointment.repository';
import { TestClock } from '../../../domain/shared/clock';
import { Appointment } from '../../../domain/appointment/appointment.aggregate';
import {
  AppointmentType,
  AppointmentTypeEnum,
} from '../../../domain/value-objects/appointment-type.vo';
import { TimeRange } from '../../../domain/value-objects/time-range.vo';
import { AppointmentId } from '../../../domain/appointment/appointment-id.vo';
import { AppointmentStatus } from '../../../domain/value-objects/appointment-status.enum';

describe('Lifecycle Command Handlers', () => {
  let mockApptRepo: jest.Mocked<AppointmentRepository>;
  const clock = new TestClock(new Date('2026-08-03T10:00:00.000Z'));
  const apptType = AppointmentType.create(AppointmentTypeEnum.TREATMENT);
  const initialTimeRange = TimeRange.create(
    new Date('2026-08-03T11:00:00.000Z'),
    new Date('2026-08-03T12:00:00.000Z'),
  );

  beforeEach(() => {
    mockApptRepo = {
      findById: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
      findConflictingAppointments: jest.fn(),
      findAppointmentsForTherapist: jest.fn(),
      findAppointmentsForRoom: jest.fn(),
      findAppointmentsForClient: jest.fn(),
    };
  });

  describe('ConfirmAppointmentHandler', () => {
    it('should transition SCHEDULED appointment to CONFIRMED and save aggregate', async () => {
      const appt = Appointment.create(
        {
          id: AppointmentId.create('appt_1'),
          clientId: 'client_1',
          therapistId: 'therapist_1',
          roomId: 'room_1',
          type: apptType,
          timeRange: initialTimeRange,
        },
        clock,
      );

      mockApptRepo.findById.mockResolvedValueOnce(appt);
      const handler = new ConfirmAppointmentHandler(mockApptRepo, clock);

      const command = new ConfirmAppointmentCommand({
        appointmentId: 'appt_1',
        expectedVersion: 1,
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().status).toBe('CONFIRMED');
      expect(mockApptRepo.save).toHaveBeenCalledTimes(1);
    });

    it('should fail on version mismatch', async () => {
      const appt = Appointment.create(
        {
          id: AppointmentId.create('appt_1'),
          clientId: 'client_1',
          therapistId: 'therapist_1',
          roomId: 'room_1',
          type: apptType,
          timeRange: initialTimeRange,
        },
        clock,
      );

      mockApptRepo.findById.mockResolvedValueOnce(appt);
      const handler = new ConfirmAppointmentHandler(mockApptRepo, clock);

      const command = new ConfirmAppointmentCommand({
        appointmentId: 'appt_1',
        expectedVersion: 999,
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toContain('Concurrency version mismatch');
    });
  });

  describe('CheckInAppointmentHandler', () => {
    it('should transition appointment to CHECKED_IN and save aggregate', async () => {
      const appt = Appointment.create(
        {
          id: AppointmentId.create('appt_2'),
          clientId: 'client_1',
          therapistId: 'therapist_1',
          roomId: 'room_1',
          type: apptType,
          timeRange: initialTimeRange,
        },
        clock,
      );

      mockApptRepo.findById.mockResolvedValueOnce(appt);
      const handler = new CheckInAppointmentHandler(mockApptRepo, clock);

      const command = new CheckInAppointmentCommand({
        appointmentId: 'appt_2',
        expectedVersion: 1,
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().status).toBe('CHECKED_IN');
      expect(mockApptRepo.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('CompleteAppointmentHandler', () => {
    it('should transition IN_PROGRESS appointment to COMPLETED and save aggregate', async () => {
      const appt = Appointment.create(
        {
          id: AppointmentId.create('appt_3'),
          clientId: 'client_1',
          therapistId: 'therapist_1',
          roomId: 'room_1',
          type: apptType,
          timeRange: initialTimeRange,
        },
        clock,
      );
      appt.confirm(clock);
      appt.checkIn(clock);
      appt.start(clock);

      mockApptRepo.findById.mockResolvedValueOnce(appt);
      const handler = new CompleteAppointmentHandler(mockApptRepo, clock);

      const command = new CompleteAppointmentCommand({
        appointmentId: 'appt_3',
        expectedVersion: 4,
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().status).toBe('COMPLETED');
      expect(mockApptRepo.save).toHaveBeenCalledTimes(1);
    });

    it('should fail when attempting to complete a CANCELLED appointment', async () => {
      const appt = Appointment.reconstitute({
        id: AppointmentId.create('appt_3'),
        version: 2,
        status: AppointmentStatus.CANCELLED,
        type: apptType,
        clientId: 'client_1',
        therapistId: 'therapist_1',
        roomId: 'room_1',
        timeRange: initialTimeRange,
        cancellationReason: 'Cancelled',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockApptRepo.findById.mockResolvedValueOnce(appt);
      const handler = new CompleteAppointmentHandler(mockApptRepo, clock);

      const command = new CompleteAppointmentCommand({
        appointmentId: 'appt_3',
        expectedVersion: 2,
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toContain('transition');
    });
  });

  describe('MarkNoShowHandler', () => {
    it('should transition SCHEDULED appointment to NO_SHOW and save aggregate', async () => {
      const appt = Appointment.create(
        {
          id: AppointmentId.create('appt_4'),
          clientId: 'client_1',
          therapistId: 'therapist_1',
          roomId: 'room_1',
          type: apptType,
          timeRange: initialTimeRange,
        },
        clock,
      );

      mockApptRepo.findById.mockResolvedValueOnce(appt);
      const handler = new MarkNoShowHandler(mockApptRepo, clock);

      const command = new MarkNoShowCommand({
        appointmentId: 'appt_4',
        expectedVersion: 1,
        reason: 'Client did not arrive',
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.status).toBe('NO_SHOW');
      expect(dto.cancellationReason).toBe('Client did not arrive');
      expect(mockApptRepo.save).toHaveBeenCalledTimes(1);
    });
  });
});
