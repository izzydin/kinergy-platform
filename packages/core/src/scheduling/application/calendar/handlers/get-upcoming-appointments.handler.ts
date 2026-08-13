import { QueryHandler } from '../../shared/query-handler.interface';
import { ApplicationResult } from '../../shared/application-result';
import { AppointmentRepository } from '../../../domain/repositories/appointment.repository';
import { TimeRange } from '../../../domain/value-objects/time-range.vo';
import { CalendarSlotDTO } from '../dtos/calendar-slot.dto';
import { CalendarGridMapper } from '../mappers/calendar-grid.mapper';
import { GetUpcomingAppointmentsQuery } from '../queries/get-upcoming-appointments.query';
import { Clock, SystemClock } from '../../../domain/shared/clock';

/**
 * CQRS Query Handler retrieving next N upcoming appointments starting from Clock.now().
 */
export class GetUpcomingAppointmentsHandler implements QueryHandler<
  GetUpcomingAppointmentsQuery,
  ApplicationResult<CalendarSlotDTO[]>
> {
  constructor(
    private readonly appointmentRepository: AppointmentRepository,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  public async execute(
    query: GetUpcomingAppointmentsQuery,
  ): Promise<ApplicationResult<CalendarSlotDTO[]>> {
    try {
      const { input } = query;
      const limit = Math.max(input.limit ?? 10, 1);
      const now = this.clock.now();

      // Look forward 30 days from now
      const futureEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const range = TimeRange.create(now, futureEnd);

      const appointments = await this.appointmentRepository.findAppointmentsByRange(range, {
        therapistId: input.therapistId,
        roomId: input.roomId,
        clientId: input.clientId,
      });

      // Filter non-cancelled appointments starting at or after now
      const upcoming = appointments
        .filter(
          (appt) => appt.status !== 'CANCELLED' && appt.timeRange.start.getTime() >= now.getTime(),
        )
        .sort((a, b) => a.timeRange.start.getTime() - b.timeRange.start.getTime())
        .slice(0, limit);

      const slots: CalendarSlotDTO[] = upcoming.map((appt) => {
        const slot = CalendarGridMapper.mapAppointmentToSlot(appt);
        return {
          ...slot,
          operationalStatus: 'UPCOMING',
        };
      });

      return ApplicationResult.ok(slots);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return ApplicationResult.fail(message);
    }
  }
}
