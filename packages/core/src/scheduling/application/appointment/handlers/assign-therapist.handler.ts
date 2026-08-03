import { CommandHandler } from '../../shared/command-handler.interface';
import { ApplicationResult } from '../../shared/application-result';
import { AssignTherapistCommand } from '../commands/assign-therapist.command';
import { AppointmentDTO } from '../dtos/appointment.dto';
import { AppointmentMapper } from '../mappers/appointment.mapper';
import { AppointmentRepository } from '../../../domain/repositories/appointment.repository';
import { TherapistScheduleRepository } from '../../../domain/repositories/therapist-schedule.repository';
import { TherapistAvailabilitySpecification } from '../../../domain/specifications/therapist-availability.specification';
import { ConflictDetectionService } from '../../../domain/services/conflict-detection.service';
import { Clock } from '../../../domain/shared/clock';
import { AppointmentId } from '../../../domain/appointment/appointment-id.vo';
import { AppointmentConflictException } from '../../../domain/exceptions/appointment-conflict.exception';
import { AppointmentStatus } from '../../../domain/value-objects/appointment-status.enum';

/**
 * CQRS Command Handler executing therapist reassignment workflows.
 */
export class AssignTherapistHandler implements CommandHandler<
  AssignTherapistCommand,
  ApplicationResult<AppointmentDTO>
> {
  constructor(
    private readonly appointmentRepository: AppointmentRepository,
    private readonly scheduleRepository: TherapistScheduleRepository,
    private readonly conflictDetectionService: ConflictDetectionService,
    private readonly availabilitySpec: TherapistAvailabilitySpecification,
    private readonly clock: Clock,
  ) {}

  /** Executes therapist reassignment with schedule availability and conflict checks */
  public async execute(
    command: AssignTherapistCommand,
  ): Promise<ApplicationResult<AppointmentDTO>> {
    try {
      const { input } = command;
      const apptId = AppointmentId.create(input.appointmentId);
      const appointment = await this.appointmentRepository.findById(apptId);

      if (!appointment) {
        return ApplicationResult.fail(`Appointment with ID '${input.appointmentId}' not found.`);
      }

      if (appointment.version !== input.expectedVersion) {
        return ApplicationResult.fail(
          `Concurrency version mismatch: expected ${input.expectedVersion}, but aggregate is at version ${appointment.version}.`,
        );
      }

      if (
        appointment.status === AppointmentStatus.COMPLETED ||
        appointment.status === AppointmentStatus.CANCELLED ||
        appointment.status === AppointmentStatus.NO_SHOW
      ) {
        return ApplicationResult.fail(
          `Cannot assign therapist to appointment in terminal '${appointment.status}' status.`,
        );
      }

      // Validate therapist schedule availability
      const schedule = await this.scheduleRepository.findByTherapistId(input.newTherapistId);
      if (schedule) {
        const isAvailable = this.availabilitySpec.isSatisfiedBy({
          schedule,
          range: appointment.timeRange,
        });
        if (!isAvailable) {
          return ApplicationResult.fail(
            `Therapist '${input.newTherapistId}' is unavailable for the requested time range.`,
          );
        }
      }

      // Check conflicts
      const conflicts = await this.conflictDetectionService.detectConflicts({
        therapistId: input.newTherapistId,
        roomId: appointment.roomId,
        clientId: appointment.clientId,
        requestedRange: appointment.timeRange,
        excludeAppointmentId: appointment.id.getValue(),
      });

      if (conflicts.length > 0) {
        throw new AppointmentConflictException(conflicts);
      }

      appointment.assignTherapist(input.newTherapistId, this.clock);
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
