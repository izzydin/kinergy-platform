import { CommandHandler } from '../../shared/command-handler.interface';
import { ApplicationResult } from '../../shared/application-result';
import { MarkNoShowCommand } from '../commands/mark-no-show.command';
import { AppointmentDTO } from '../dtos/appointment.dto';
import { AppointmentMapper } from '../mappers/appointment.mapper';
import { AppointmentRepository } from '../../../domain/repositories/appointment.repository';
import { Clock } from '../../../domain/shared/clock';
import { AppointmentId } from '../../../domain/appointment/appointment-id.vo';

/**
 * CQRS Command Handler executing NO_SHOW status tagging transitions.
 */
export class MarkNoShowHandler implements CommandHandler<
  MarkNoShowCommand,
  ApplicationResult<AppointmentDTO>
> {
  constructor(
    private readonly appointmentRepository: AppointmentRepository,
    private readonly clock: Clock,
  ) {}

  /** Executes appointment NO_SHOW tagging transition */
  public async execute(command: MarkNoShowCommand): Promise<ApplicationResult<AppointmentDTO>> {
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

      appointment.markNoShow(input.reason, this.clock);
      await this.appointmentRepository.save(appointment);

      return ApplicationResult.ok(AppointmentMapper.toDTO(appointment));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return ApplicationResult.fail(message);
    }
  }
}
