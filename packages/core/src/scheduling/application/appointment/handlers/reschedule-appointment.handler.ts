import { CommandHandler } from '../../shared/command-handler.interface';
import { ApplicationResult } from '../../shared/application-result';
import { RescheduleAppointmentCommand } from '../commands/reschedule-appointment.command';
import { AppointmentDTO } from '../dtos/appointment.dto';
import { AppointmentMapper } from '../mappers/appointment.mapper';
import { AppointmentRepository } from '../../../domain/repositories/appointment.repository';
import { ConflictDetectionService } from '../../../domain/services/conflict-detection.service';
import { ReschedulePolicy } from '../../../domain/policies/reschedule.policy';
import { Clock } from '../../../domain/shared/clock';
import { TimeRange } from '../../../domain/value-objects/time-range.vo';
import { AppointmentId } from '../../../domain/appointment/appointment-id.vo';
import { AppointmentConflictException } from '../../../domain/exceptions/appointment-conflict.exception';
import { AppointmentStatus } from '../../../domain/value-objects/appointment-status.enum';

/**
 * CQRS Command Handler for rescheduling an appointment to a new time range.
 */
export class RescheduleAppointmentHandler implements CommandHandler<
  RescheduleAppointmentCommand,
  ApplicationResult<AppointmentDTO>
> {
  constructor(
    private readonly appointmentRepository: AppointmentRepository,
    private readonly conflictDetectionService: ConflictDetectionService,
    private readonly reschedulePolicy: ReschedulePolicy,
    private readonly clock: Clock,
  ) {}

  /**
   * Executes the appointment rescheduling workflow.
   */
  public async execute(
    command: RescheduleAppointmentCommand,
  ): Promise<ApplicationResult<AppointmentDTO>> {
    try {
      const { input } = command;

      // 1. Fetch Aggregate Root
      const apptId = AppointmentId.create(input.appointmentId);
      const appointment = await this.appointmentRepository.findById(apptId);

      if (!appointment) {
        return ApplicationResult.fail(`Appointment with ID '${input.appointmentId}' not found.`);
      }

      // 2. Validate Optimistic Concurrency Control Version
      if (appointment.version !== input.expectedVersion) {
        return ApplicationResult.fail(
          `Concurrency version mismatch: expected ${input.expectedVersion}, but aggregate is at version ${appointment.version}.`,
        );
      }

      // 3. Assert Non-Terminal State
      if (
        appointment.status === AppointmentStatus.COMPLETED ||
        appointment.status === AppointmentStatus.CANCELLED ||
        appointment.status === AppointmentStatus.NO_SHOW
      ) {
        return ApplicationResult.fail(
          `Cannot reschedule appointment in terminal '${appointment.status}' status.`,
        );
      }

      // 4. Construct New TimeRange
      const newTimeRange = TimeRange.create(
        new Date(input.newStartTime),
        new Date(input.newEndTime),
      );

      // 5. Evaluate Reschedule Policy
      const policyResult = this.reschedulePolicy.validateReschedule(
        0,
        appointment.timeRange.start,
        newTimeRange.start,
        this.clock,
      );

      if (!policyResult.isValid) {
        return ApplicationResult.fail(
          policyResult.reason ?? 'Reschedule policy validation failed.',
        );
      }

      // 6. Detect Conflicts for New TimeRange & Target Room with Turnaround Buffer & Self-Exclusion
      const targetRoomId = input.newRoomId ?? appointment.roomId;
      const conflicts = await this.conflictDetectionService.detectConflicts({
        therapistId: appointment.therapistId,
        roomId: targetRoomId,
        clientId: appointment.clientId,
        requestedRange: newTimeRange,
        appointmentType: appointment.type,
        excludeAppointmentId: appointment.id.getValue(),
        ignoreAppointmentId: appointment.id.getValue(),
        requiredCapacity: input.requiredCapacity,
        requiredFeatures: input.requiredFeatures,
      });

      if (conflicts.length > 0) {
        throw new AppointmentConflictException(conflicts);
      }

      // 7. Mutate Aggregate State & Persist
      appointment.reschedule(newTimeRange, this.clock);
      if (input.newRoomId && input.newRoomId !== appointment.roomId) {
        appointment.assignRoom(input.newRoomId, this.clock);
      }
      await this.appointmentRepository.save(appointment);

      // 8. Return Updated DTO
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
