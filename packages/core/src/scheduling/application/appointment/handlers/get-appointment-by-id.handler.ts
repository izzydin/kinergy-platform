import { QueryHandler } from '../../shared/query-handler.interface';
import { ApplicationResult } from '../../shared/application-result';
import { GetAppointmentByIdQuery } from '../queries/get-appointment-by-id.query';
import { AppointmentDTO } from '../dtos/appointment.dto';
import { AppointmentMapper } from '../mappers/appointment.mapper';
import { AppointmentRepository } from '../../../domain/repositories/appointment.repository';

/**
 * CQRS Query Handler retrieving a single appointment by ID.
 */
export class GetAppointmentByIdHandler implements QueryHandler<
  GetAppointmentByIdQuery,
  ApplicationResult<AppointmentDTO>
> {
  constructor(private readonly appointmentRepository: AppointmentRepository) {}

  /** Executes read query by AppointmentId */
  public async execute(query: GetAppointmentByIdQuery): Promise<ApplicationResult<AppointmentDTO>> {
    try {
      const appointment = await this.appointmentRepository.findById(query.input.appointmentId);
      if (!appointment) {
        return ApplicationResult.fail(
          `Appointment with ID '${query.input.appointmentId}' not found.`,
        );
      }

      return ApplicationResult.ok(AppointmentMapper.toDTO(appointment));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return ApplicationResult.fail(message);
    }
  }
}
