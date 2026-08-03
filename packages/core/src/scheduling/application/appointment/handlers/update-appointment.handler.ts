import { CommandHandler } from '../../shared/command-handler.interface';
import { ApplicationResult } from '../../shared/application-result';
import { UpdateAppointmentCommand } from '../commands/update-appointment.command';
import { AppointmentDTO } from '../dtos/appointment.dto';
import { AppointmentMapper } from '../mappers/appointment.mapper';
import { AppointmentRepository } from '../../../domain/repositories/appointment.repository';
import { ConflictDetectionService } from '../../../domain/services/conflict-detection.service';
import { Clock } from '../../../domain/shared/clock';
import { TimeRange } from '../../../domain/value-objects/time-range.vo';
import { AppointmentId } from '../../../domain/appointment/appointment-id.vo';
import { AppointmentConflictException } from '../../../domain/exceptions/appointment-conflict.exception';
import { AppointmentStatus } from '../../../domain/value-objects/appointment-status.enum';

/**
 * CQRS Command Handler executing appointment update workflows (rescheduling, reassigning therapist/room).
 */
export class UpdateAppointmentHandler implements CommandHandler<
  UpdateAppointmentCommand,
  ApplicationResult<AppointmentDTO>
> {
  constructor(
    private readonly appointmentRepository: AppointmentRepository,
    private readonly conflictDetectionService: ConflictDetectionService,
    private readonly clock: Clock,
  ) {}

  /**
   * Executes appointment updates with optimistic concurrency checks and re-conflict validations.
   */
  public async execute(
    command: UpdateAppointmentCommand,
  ): Promise<ApplicationResult<AppointmentDTO>> {
    try {
      const { input } = command;

      // 1. Fetch Aggregate
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
          `Cannot update appointment in terminal '${appointment.status}' status.`,
        );
      }

      // 4. Determine mutated parameters
      let targetTimeRange = appointment.timeRange;
      if (input.newTimeRange) {
        targetTimeRange = TimeRange.create(
          new Date(input.newTimeRange.startTime),
          new Date(input.newTimeRange.endTime),
        );
      }

      const targetTherapistId = input.newTherapistId ?? appointment.therapistId;
      const targetRoomId = input.newRoomId ?? appointment.roomId;

      const hasScheduleChanges =
        !targetTimeRange.equals(appointment.timeRange) ||
        targetTherapistId !== appointment.therapistId ||
        targetRoomId !== appointment.roomId;

      // 5. Re-evaluate Conflict Detection if Schedule/Resource altered
      if (hasScheduleChanges) {
        const conflicts = await this.conflictDetectionService.detectConflicts({
          therapistId: targetTherapistId,
          roomId: targetRoomId,
          clientId: appointment.clientId,
          requestedRange: targetTimeRange,
          appointmentType: appointment.type,
          excludeAppointmentId: appointment.id.getValue(),
          ignoreAppointmentId: appointment.id.getValue(),
        });

        if (conflicts.length > 0) {
          throw new AppointmentConflictException(conflicts);
        }
      }

      // 6. Mutate Aggregate Root
      if (!targetTimeRange.equals(appointment.timeRange)) {
        appointment.reschedule(targetTimeRange, this.clock);
      }
      if (targetTherapistId !== appointment.therapistId) {
        appointment.assignTherapist(targetTherapistId, this.clock);
      }
      if (targetRoomId !== appointment.roomId) {
        appointment.assignRoom(targetRoomId, this.clock);
      }

      // 7. Persist and Return
      await this.appointmentRepository.save(appointment);
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
