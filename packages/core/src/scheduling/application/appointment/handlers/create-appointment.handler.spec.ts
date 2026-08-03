import { CreateAppointmentHandler } from './create-appointment.handler';
import { CreateAppointmentCommand } from '../commands/create-appointment.command';
import { AppointmentRepository } from '../../../domain/repositories/appointment.repository';
import { ConflictDetectionService } from '../../../domain/services/conflict-detection.service';
import { BookingWindowPolicy } from '../../../domain/policies/booking-window.policy';
import { DefaultAppointmentDurationPolicy } from '../../../domain/policies/appointment-duration.policy';
import { BookingIdempotencyPolicy } from '../../../domain/policies/booking-idempotency.policy';
import { TestClock } from '../../../domain/shared/clock';
import { Appointment } from '../../../domain/appointment/appointment.aggregate';
import { AppointmentConflictException } from '../../../domain/exceptions/appointment-conflict.exception';
import { SchedulingConflict } from '../../../domain/value-objects/scheduling-conflict.vo';
import { TimeRange } from '../../../domain/value-objects/time-range.vo';

describe('CreateAppointmentHandler', () => {
  let handler: CreateAppointmentHandler;
  let mockApptRepo: jest.Mocked<AppointmentRepository>;
  let mockConflictService: jest.Mocked<ConflictDetectionService>;
  let mockWindowPolicy: jest.Mocked<BookingWindowPolicy>;
  let mockDurationPolicy: DefaultAppointmentDurationPolicy;
  let mockIdempotencyPolicy: BookingIdempotencyPolicy;
  const clock = new TestClock(new Date('2026-08-03T10:00:00.000Z'));

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

    mockWindowPolicy = {
      validateBookingWindow: jest.fn().mockReturnValue(true),
    } as unknown as jest.Mocked<BookingWindowPolicy>;

    mockDurationPolicy = new DefaultAppointmentDurationPolicy();
    mockIdempotencyPolicy = new BookingIdempotencyPolicy();

    handler = new CreateAppointmentHandler(
      mockApptRepo,
      mockConflictService,
      mockWindowPolicy,
      mockDurationPolicy,
      mockIdempotencyPolicy,
      clock,
    );
  });

  it('should successfully execute appointment creation and persist aggregate', async () => {
    const command = new CreateAppointmentCommand({
      clientId: 'client_100',
      therapistId: 'therapist_200',
      roomId: 'room_300',
      type: 'TREATMENT',
      startTime: '2026-08-03T14:00:00.000Z',
      endTime: '2026-08-03T15:00:00.000Z',
    });

    const result = await handler.execute(command);

    expect(result.isSuccess).toBe(true);
    const dto = result.getValue();
    expect(dto.clientId).toBe('client_100');
    expect(dto.therapistId).toBe('therapist_200');
    expect(dto.status).toBe('SCHEDULED');
    expect(mockApptRepo.save).toHaveBeenCalledTimes(1);
    expect(mockApptRepo.save).toHaveBeenCalledWith(expect.any(Appointment));
  });

  it('should default duration to 60 minutes if endTime is omitted', async () => {
    const command = new CreateAppointmentCommand({
      clientId: 'client_100',
      therapistId: 'therapist_200',
      roomId: 'room_300',
      type: 'TREATMENT',
      startTime: '2026-08-03T14:00:00.000Z',
    });

    const result = await handler.execute(command);

    expect(result.isSuccess).toBe(true);
    const dto = result.getValue();
    expect(dto.endTime).toBe('2026-08-03T15:00:00.000Z');
  });

  it('should fail if idempotency check detects duplicate requestToken', async () => {
    const command = new CreateAppointmentCommand({
      clientId: 'client_100',
      therapistId: 'therapist_200',
      roomId: 'room_300',
      type: 'TREATMENT',
      startTime: '2026-08-03T14:00:00.000Z',
      requestToken: 'token_abc123',
    });

    await handler.execute(command);
    const secondResult = await handler.execute(command);

    expect(secondResult.isFailure).toBe(true);
    expect(secondResult.getError()).toContain('Duplicate request detected');
  });

  it('should throw AppointmentConflictException if conflict detection returns conflicts', async () => {
    const range = TimeRange.create(
      new Date('2026-08-03T14:00:00.000Z'),
      new Date('2026-08-03T15:00:00.000Z'),
    );
    mockConflictService.detectConflicts.mockResolvedValueOnce([
      SchedulingConflict.create({
        conflictType: 'THERAPIST',
        conflictingEntityId: 'therapist_200',
        requestedRange: range,
        reason: 'Therapist busy',
      }),
    ]);

    const command = new CreateAppointmentCommand({
      clientId: 'client_100',
      therapistId: 'therapist_200',
      roomId: 'room_300',
      type: 'TREATMENT',
      startTime: '2026-08-03T14:00:00.000Z',
      endTime: '2026-08-03T15:00:00.000Z',
    });

    await expect(handler.execute(command)).rejects.toThrow(AppointmentConflictException);
  });
});
