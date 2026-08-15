import { CommandHandler } from '../../shared/command-handler.interface';
import { ApplicationResult } from '../../shared/application-result';
import { CreateAppointmentCommand } from '../commands/create-appointment.command';
import { AppointmentDTO } from '../dtos/appointment.dto';
import { AppointmentMapper } from '../mappers/appointment.mapper';
import { AppointmentRepository } from '../../../domain/repositories/appointment.repository';
import { ConflictDetectionService } from '../../../domain/services/conflict-detection.service';
import { BookingWindowPolicy } from '../../../domain/policies/booking-window.policy';
import { DefaultAppointmentDurationPolicy } from '../../../domain/policies/appointment-duration.policy';
import { BookingIdempotencyPolicy } from '../../../domain/policies/booking-idempotency.policy';
import { Clock } from '../../../domain/shared/clock';
import { TimeRange } from '../../../domain/value-objects/time-range.vo';
import { AppointmentType } from '../../../domain/value-objects/appointment-type.vo';
import { AppointmentId } from '../../../domain/appointment/appointment-id.vo';
import { Appointment } from '../../../domain/appointment/appointment.aggregate';
import { AppointmentConflictException } from '../../../domain/exceptions/appointment-conflict.exception';

/**
 * CQRS Command Handler executing appointment creation use cases with policy validations and conflict checks.
 */
export class CreateAppointmentHandler implements CommandHandler<
  CreateAppointmentCommand,
  ApplicationResult<AppointmentDTO>
> {
  constructor(
    private readonly appointmentRepository: AppointmentRepository,
    private readonly conflictDetectionService: ConflictDetectionService,
    private readonly bookingWindowPolicy: BookingWindowPolicy,
    private readonly durationPolicy: DefaultAppointmentDurationPolicy,
    private readonly idempotencyPolicy: BookingIdempotencyPolicy,
    private readonly clock: Clock,
  ) {}

  /**
   * Executes the appointment creation workflow.
   */
  public async execute(
    command: CreateAppointmentCommand,
  ): Promise<ApplicationResult<AppointmentDTO>> {
    try {
      const { input } = command;

      // 1. Idempotency Check
      if (input.requestToken) {
        if (!this.idempotencyPolicy.registerRequest(input.requestToken)) {
          return ApplicationResult.fail(
            `Duplicate request detected for token '${input.requestToken}'.`,
          );
        }
      }

      // 2. Parse Appointment Type
      const apptType = AppointmentType.create(input.type);

      // 3. Resolve & Validate TimeRange (Default: 60 minutes if duration omitted)
      const start = new Date(input.startTime);
      let end: Date;
      if (input.endTime) {
        end = new Date(input.endTime);
      } else {
        const defaultDuration = this.durationPolicy.getDefaultDuration(apptType);
        end = new Date(start.getTime() + defaultDuration.toMilliseconds());
      }

      const timeRange = TimeRange.create(start, end);

      // Validate duration policy bounds
      const durationValidation = this.durationPolicy.validateDuration(
        apptType,
        timeRange.duration(),
      );
      if (!durationValidation.isValid) {
        return ApplicationResult.fail(
          durationValidation.reason ??
            `Invalid duration of ${timeRange.duration().toMinutes()} minutes for type '${apptType.getValue()}'.`,
        );
      }

      // 4. Validate Booking Window Lead Time
      if (!this.bookingWindowPolicy.validateBookingWindow(start, this.clock)) {
        return ApplicationResult.fail(
          'Booking window violation: Start time fails lead time or maximum horizon rules.',
        );
      }

      // 5. Detect Multi-Aggregate Conflicts with Turnaround Buffer
      const conflicts = await this.conflictDetectionService.detectConflicts({
        therapistId: input.therapistId,
        roomId: input.roomId,
        clientId: input.clientId,
        requestedRange: timeRange,
        appointmentType: apptType,
        requiredCapacity: input.requiredCapacity,
        requiredFeatures: input.requiredFeatures,
      });

      if (conflicts.length > 0) {
        throw new AppointmentConflictException(conflicts);
      }

      // 6. Create & Persist Aggregate Root
      const apptId = input.id ? AppointmentId.create(input.id) : undefined;
      const appointment = Appointment.create(
        {
          id: apptId,
          clientId: input.clientId,
          therapistId: input.therapistId,
          roomId: input.roomId,
          type: apptType,
          timeRange,
        },
        this.clock,
      );

      await this.appointmentRepository.save(appointment);

      // 7. Return Result DTO
      return ApplicationResult.ok(AppointmentMapper.toDTO(appointment));
    } catch (err: unknown) {
      if (err instanceof AppointmentConflictException) {
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      return ApplicationResult.fail(message);
    }
  }
}
