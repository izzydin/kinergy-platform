import { UpdateAppointmentHandler } from './update-appointment.handler';
import { UpdateAppointmentCommand } from '../commands/update-appointment.command';
import { AppointmentRepository } from '../../../domain/repositories/appointment.repository';
import { ConflictDetectionService } from '../../../domain/services/conflict-detection.service';
import { TestClock } from '../../../domain/shared/clock';
import { Appointment } from '../../../domain/appointment/appointment.aggregate';
import {
  AppointmentType,
  AppointmentTypeEnum,
} from '../../../domain/value-objects/appointment-type.vo';
import { TimeRange } from '../../../domain/value-objects/time-range.vo';
import { AppointmentId } from '../../../domain/appointment/appointment-id.vo';
import { AppointmentStatus } from '../../../domain/value-objects/appointment-status.enum';

describe('UpdateAppointmentHandler', () => {
  let handler: UpdateAppointmentHandler;
  let mockApptRepo: jest.Mocked<AppointmentRepository>;
  let mockConflictService: jest.Mocked<ConflictDetectionService>;
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

    mockConflictService = {
      detectConflicts: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<ConflictDetectionService>;

    handler = new UpdateAppointmentHandler(mockApptRepo, mockConflictService, clock);
  });

  it('should successfully update appointment reschedule and therapist assignment', async () => {
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

    const command = new UpdateAppointmentCommand({
      appointmentId: 'appt_123',
      expectedVersion: 1,
      newTherapistId: 'therapist_999',
      newTimeRange: {
        startTime: '2026-08-03T14:00:00.000Z',
        endTime: '2026-08-03T15:00:00.000Z',
      },
    });

    const result = await handler.execute(command);

    expect(result.isSuccess).toBe(true);
    const dto = result.getValue();
    expect(dto.therapistId).toBe('therapist_999');
    expect(dto.startTime).toBe('2026-08-03T14:00:00.000Z');
    expect(mockApptRepo.save).toHaveBeenCalledTimes(1);
  });

  it('should return failure if appointment is not found', async () => {
    mockApptRepo.findById.mockResolvedValueOnce(null);

    const command = new UpdateAppointmentCommand({
      appointmentId: 'non_existent',
      expectedVersion: 1,
    });

    const result = await handler.execute(command);

    expect(result.isFailure).toBe(true);
    expect(result.getError()).toContain('not found');
  });

  it('should return failure if concurrency expectedVersion mismatches aggregate version', async () => {
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

    const command = new UpdateAppointmentCommand({
      appointmentId: 'appt_123',
      expectedVersion: 999, // Mismatch!
    });

    const result = await handler.execute(command);

    expect(result.isFailure).toBe(true);
    expect(result.getError()).toContain('Concurrency version mismatch');
  });

  it('should return failure when attempting to update a COMPLETED appointment', async () => {
    const appt = Appointment.reconstitute({
      id: AppointmentId.create('appt_123'),
      version: 5,
      status: AppointmentStatus.COMPLETED,
      type: apptType,
      clientId: 'client_100',
      therapistId: 'therapist_200',
      roomId: 'room_300',
      timeRange: initialTimeRange,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockApptRepo.findById.mockResolvedValueOnce(appt);

    const command = new UpdateAppointmentCommand({
      appointmentId: 'appt_123',
      expectedVersion: 5,
      newTherapistId: 'therapist_999',
    });

    const result = await handler.execute(command);

    expect(result.isFailure).toBe(true);
    expect(result.getError()).toContain('terminal');
  });
});
