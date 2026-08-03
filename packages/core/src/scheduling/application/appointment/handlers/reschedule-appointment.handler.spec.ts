import { RescheduleAppointmentHandler } from './reschedule-appointment.handler';
import { RescheduleAppointmentCommand } from '../commands/reschedule-appointment.command';
import { AppointmentRepository } from '../../../domain/repositories/appointment.repository';
import { ConflictDetectionService } from '../../../domain/services/conflict-detection.service';
import { ReschedulePolicy } from '../../../domain/policies/reschedule.policy';
import { TestClock } from '../../../domain/shared/clock';
import { Appointment } from '../../../domain/appointment/appointment.aggregate';
import {
  AppointmentType,
  AppointmentTypeEnum,
} from '../../../domain/value-objects/appointment-type.vo';
import { TimeRange } from '../../../domain/value-objects/time-range.vo';
import { AppointmentId } from '../../../domain/appointment/appointment-id.vo';
import { AppointmentStatus } from '../../../domain/value-objects/appointment-status.enum';

describe('RescheduleAppointmentHandler', () => {
  let handler: RescheduleAppointmentHandler;
  let mockApptRepo: jest.Mocked<AppointmentRepository>;
  let mockConflictService: jest.Mocked<ConflictDetectionService>;
  let mockPolicy: ReschedulePolicy;
  const clock = new TestClock(new Date('2026-08-03T10:00:00.000Z'));
  const apptType = AppointmentType.create(AppointmentTypeEnum.TREATMENT);

  const initialTimeRange = TimeRange.create(
    new Date('2026-08-04T10:00:00.000Z'),
    new Date('2026-08-04T11:00:00.000Z'),
  );

  beforeEach(() => {
    mockApptRepo = {
      findById: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
      findConflictingAppointments: jest.fn(),
      findAppointmentsForTherapist: jest.fn(),
      findAppointmentsForRoom: jest.fn(),
      findAppointmentsForClient: jest.fn(),
      findAppointmentsByRange: jest.fn().mockResolvedValue([]),
    };

    mockConflictService = {
      detectConflicts: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<ConflictDetectionService>;

    mockPolicy = new ReschedulePolicy();

    handler = new RescheduleAppointmentHandler(
      mockApptRepo,
      mockConflictService,
      mockPolicy,
      clock,
    );
  });

  it('should successfully reschedule appointment and persist aggregate', async () => {
    const existingAppt = Appointment.create(
      {
        id: AppointmentId.create('appt_123'),
        clientId: 'client_100',
        therapistId: 'therapist_200',
        roomId: 'room_300',
        type: apptType,
        timeRange: initialTimeRange,
      },
      clock,
    );

    mockApptRepo.findById.mockResolvedValueOnce(existingAppt);

    const command = new RescheduleAppointmentCommand({
      appointmentId: 'appt_123',
      expectedVersion: 1,
      newStartTime: '2026-08-05T14:00:00.000Z',
      newEndTime: '2026-08-05T15:00:00.000Z',
    });

    const result = await handler.execute(command);

    expect(result.isSuccess).toBe(true);
    const dto = result.getValue();
    expect(dto.startTime).toBe('2026-08-05T14:00:00.000Z');
    expect(dto.status).toBe('RESCHEDULED');
    expect(mockApptRepo.save).toHaveBeenCalledTimes(1);
  });

  it('should return failure if appointment is not found', async () => {
    mockApptRepo.findById.mockResolvedValueOnce(null);

    const command = new RescheduleAppointmentCommand({
      appointmentId: 'non_existent',
      expectedVersion: 1,
      newStartTime: '2026-08-05T14:00:00.000Z',
      newEndTime: '2026-08-05T15:00:00.000Z',
    });

    const result = await handler.execute(command);

    expect(result.isFailure).toBe(true);
    expect(result.getError()).toContain('not found');
  });

  it('should return failure when attempting to reschedule a CANCELLED appointment', async () => {
    const appt = Appointment.reconstitute({
      id: AppointmentId.create('appt_123'),
      version: 2,
      status: AppointmentStatus.CANCELLED,
      type: apptType,
      clientId: 'client_100',
      therapistId: 'therapist_200',
      roomId: 'room_300',
      timeRange: initialTimeRange,
      cancellationReason: 'Client sick',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockApptRepo.findById.mockResolvedValueOnce(appt);

    const command = new RescheduleAppointmentCommand({
      appointmentId: 'appt_123',
      expectedVersion: 2,
      newStartTime: '2026-08-05T14:00:00.000Z',
      newEndTime: '2026-08-05T15:00:00.000Z',
    });

    const result = await handler.execute(command);

    expect(result.isFailure).toBe(true);
    expect(result.getError()).toContain('terminal');
  });
});
