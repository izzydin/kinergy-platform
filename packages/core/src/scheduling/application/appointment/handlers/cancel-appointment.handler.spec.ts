import { CancelAppointmentHandler } from './cancel-appointment.handler';
import { CancelAppointmentCommand } from '../commands/cancel-appointment.command';
import { AppointmentRepository } from '../../../domain/repositories/appointment.repository';
import { CancellationPolicy } from '../../../domain/policies/cancellation.policy';
import { TestClock } from '../../../domain/shared/clock';
import { Appointment } from '../../../domain/appointment/appointment.aggregate';
import {
  AppointmentType,
  AppointmentTypeEnum,
} from '../../../domain/value-objects/appointment-type.vo';
import { TimeRange } from '../../../domain/value-objects/time-range.vo';
import { AppointmentId } from '../../../domain/appointment/appointment-id.vo';
import { AppointmentStatus } from '../../../domain/value-objects/appointment-status.enum';

describe('CancelAppointmentHandler', () => {
  let handler: CancelAppointmentHandler;
  let mockApptRepo: jest.Mocked<AppointmentRepository>;
  let mockPolicy: CancellationPolicy;
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
    };

    mockPolicy = new CancellationPolicy();
    handler = new CancelAppointmentHandler(mockApptRepo, mockPolicy, clock);
  });

  it('should successfully cancel appointment with reason and persist aggregate', async () => {
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

    const command = new CancelAppointmentCommand({
      appointmentId: 'appt_123',
      reason: 'Client request - schedule conflict',
      expectedVersion: 1,
    });

    const result = await handler.execute(command);

    expect(result.isSuccess).toBe(true);
    const dto = result.getValue();
    expect(dto.status).toBe('CANCELLED');
    expect(dto.cancellationReason).toBe('Client request - schedule conflict');
    expect(mockApptRepo.save).toHaveBeenCalledTimes(1);
  });

  it('should return failure if appointment is not found', async () => {
    mockApptRepo.findById.mockResolvedValueOnce(null);

    const command = new CancelAppointmentCommand({
      appointmentId: 'non_existent',
      reason: 'Cancel request',
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

    const command = new CancelAppointmentCommand({
      appointmentId: 'appt_123',
      reason: 'Cancel request',
      expectedVersion: 99, // Mismatch
    });

    const result = await handler.execute(command);

    expect(result.isFailure).toBe(true);
    expect(result.getError()).toContain('Concurrency version mismatch');
  });

  it('should return failure when attempting to cancel an already COMPLETED appointment', async () => {
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

    const command = new CancelAppointmentCommand({
      appointmentId: 'appt_123',
      reason: 'Too late cancel',
      expectedVersion: 5,
    });

    const result = await handler.execute(command);

    expect(result.isFailure).toBe(true);
    expect(result.getError()).toContain('terminal');
  });
});
