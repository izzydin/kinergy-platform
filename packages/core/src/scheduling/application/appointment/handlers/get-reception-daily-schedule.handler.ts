import { QueryHandler } from '../../shared/query-handler.interface';
import { ApplicationResult } from '../../shared/application-result';
import { GetReceptionDailyScheduleQuery } from '../queries/get-reception-daily-schedule.query';
import { ReceptionDailyScheduleDTO } from '../dtos/reception-daily-schedule.dto';
import { AppointmentDTO } from '../dtos/appointment.dto';
import { AppointmentMapper } from '../mappers/appointment.mapper';
import { AppointmentRepository } from '../../../domain/repositories/appointment.repository';
import { TimeRange } from '../../../domain/value-objects/time-range.vo';

/**
 * CQRS Query Handler retrieving reception daily schedule grids.
 */
export class GetReceptionDailyScheduleHandler implements QueryHandler<
  GetReceptionDailyScheduleQuery,
  ApplicationResult<ReceptionDailyScheduleDTO>
> {
  constructor(private readonly appointmentRepository: AppointmentRepository) {}

  /** Executes daily schedule read model query */
  public async execute(
    query: GetReceptionDailyScheduleQuery,
  ): Promise<ApplicationResult<ReceptionDailyScheduleDTO>> {
    try {
      const { input } = query;
      const dateObj = new Date(input.date);
      const year = dateObj.getUTCFullYear();
      const month = dateObj.getUTCMonth();
      const day = dateObj.getUTCDate();

      const dayStart = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
      const dayEnd = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));
      const dayRange = TimeRange.create(dayStart, dayEnd);

      const appointments = await this.appointmentRepository.findAppointmentsByRange(dayRange);
      const dtos = appointments.map((appt) => AppointmentMapper.toDTO(appt));

      const appointmentsByTherapist: Record<string, AppointmentDTO[]> = {};
      const appointmentsByRoom: Record<string, AppointmentDTO[]> = {};
      const summaryByStatus: Record<string, number> = {};

      for (const dto of dtos) {
        let therapistBucket = appointmentsByTherapist[dto.therapistId];
        if (!therapistBucket) {
          therapistBucket = [];
          appointmentsByTherapist[dto.therapistId] = therapistBucket;
        }
        therapistBucket.push(dto);

        let roomBucket = appointmentsByRoom[dto.roomId];
        if (!roomBucket) {
          roomBucket = [];
          appointmentsByRoom[dto.roomId] = roomBucket;
        }
        roomBucket.push(dto);

        summaryByStatus[dto.status] = (summaryByStatus[dto.status] ?? 0) + 1;
      }

      const formattedDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

      const schedule: ReceptionDailyScheduleDTO = {
        date: formattedDate,
        totalAppointments: dtos.length,
        appointmentsByTherapist,
        appointmentsByRoom,
        summaryByStatus,
      };

      return ApplicationResult.ok(schedule);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return ApplicationResult.fail(message);
    }
  }
}
