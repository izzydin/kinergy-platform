import { CommandHandler } from '../../shared/command-handler.interface';
import { ApplicationResult } from '../../shared/application-result';
import { CheckInAppointmentCommand } from '../commands/check-in-appointment.command';
import { AppointmentDTO } from '../dtos/appointment.dto';
import { AppointmentMapper } from '../mappers/appointment.mapper';
import { AppointmentRepository } from '../../../domain/repositories/appointment.repository';
import { Clock } from '../../../domain/shared/clock';
import { AppointmentId } from '../../../domain/appointment/appointment-id.vo';

/**
 * CQRS Command Handler executing client check-in transitions.
 */
export class CheckInAppointmentHandler implements CommandHandler<
  CheckInAppointmentCommand,
  ApplicationResult<AppointmentDTO>
> {
  constructor(
    private readonly appointmentRepository: AppointmentRepository,
    private readonly clock: Clock,
  ) {}

  /** Executes appointment check-in transition */
  public async execute(
    command: CheckInAppointmentCommand,
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

      appointment.checkIn(this.clock);
      await this.appointmentRepository.save(appointment);

      return ApplicationResult.ok(AppointmentMapper.toDTO(appointment));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return ApplicationResult.fail(message);
    }
  }
}
