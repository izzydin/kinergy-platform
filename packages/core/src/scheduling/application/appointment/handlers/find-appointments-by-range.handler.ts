import { QueryHandler } from '../../shared/query-handler.interface';
import { ApplicationResult } from '../../shared/application-result';
import { FindAppointmentsByRangeQuery } from '../queries/find-appointments-by-range.query';
import { AppointmentDTO } from '../dtos/appointment.dto';
import { AppointmentMapper } from '../mappers/appointment.mapper';
import { AppointmentRepository } from '../../../domain/repositories/appointment.repository';
import { TimeRange } from '../../../domain/value-objects/time-range.vo';

/**
 * CQRS Query Handler retrieving appointments within a time range and optional filters.
 */
export class FindAppointmentsByRangeHandler implements QueryHandler<
  FindAppointmentsByRangeQuery,
  ApplicationResult<AppointmentDTO[]>
> {
  constructor(private readonly appointmentRepository: AppointmentRepository) {}

  /** Executes range search query */
  public async execute(
    query: FindAppointmentsByRangeQuery,
  ): Promise<ApplicationResult<AppointmentDTO[]>> {
    try {
      const { input } = query;
      const range = TimeRange.create(new Date(input.startTime), new Date(input.endTime));

      const appointments = await this.appointmentRepository.findAppointmentsByRange(range, {
        therapistId: input.therapistId,
        roomId: input.roomId,
        clientId: input.clientId,
        status: input.status,
      });

      const dtos = appointments.map((appt) => AppointmentMapper.toDTO(appt));
      return ApplicationResult.ok(dtos);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return ApplicationResult.fail(message);
    }
  }
}
