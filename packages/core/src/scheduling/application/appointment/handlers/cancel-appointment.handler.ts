import { CommandHandler } from '../../shared/command-handler.interface';
import { ApplicationResult } from '../../shared/application-result';
import { CancelAppointmentCommand } from '../commands/cancel-appointment.command';
import { AppointmentDTO } from '../dtos/appointment.dto';
import { AppointmentMapper } from '../mappers/appointment.mapper';
import { AppointmentRepository } from '../../../domain/repositories/appointment.repository';
import { CancellationPolicy } from '../../../domain/policies/cancellation.policy';
import { Clock } from '../../../domain/shared/clock';
import { AppointmentId } from '../../../domain/appointment/appointment-id.vo';
import { AppointmentStatus } from '../../../domain/value-objects/appointment-status.enum';

/**
 * CQRS Command Handler executing appointment cancellation workflows.
 */
export class CancelAppointmentHandler implements CommandHandler<
  CancelAppointmentCommand,
  ApplicationResult<AppointmentDTO>
> {
  constructor(
    private readonly appointmentRepository: AppointmentRepository,
    private readonly cancellationPolicy: CancellationPolicy,
    private readonly clock: Clock,
  ) {}

  /**
   * Executes the appointment cancellation workflow.
   */
  public async execute(
    command: CancelAppointmentCommand,
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
          `Cannot cancel appointment in terminal '${appointment.status}' status.`,
        );
      }

      // 4. Evaluate Cancellation Policy (determines notice compliance)
      const now = this.clock.now();
      this.cancellationPolicy.evaluateCancellation(appointment.timeRange.start, now);

      // 5. Mutate Aggregate State & Persist
      appointment.cancel(input.reason, this.clock);
      await this.appointmentRepository.save(appointment);

      // 6. Return Result DTO
      return ApplicationResult.ok(AppointmentMapper.toDTO(appointment));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return ApplicationResult.fail(message);
    }
  }
}
