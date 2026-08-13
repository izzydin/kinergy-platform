import { QueryHandler } from '../../shared/query-handler.interface';
import { ApplicationResult } from '../../shared/application-result';
import { CalendarReadRepository } from '../repositories/calendar-read.repository';
import { ClientHistoryDTO } from '../dtos/client-history.dto';
import { GetClientHistoryQuery } from '../queries/get-client-history.query';
import { AppointmentRepository } from '../../../domain/repositories/appointment.repository';
import { TimeRange } from '../../../domain/value-objects/time-range.vo';
import { CalendarGridMapper } from '../mappers/calendar-grid.mapper';
import { Clock, SystemClock } from '../../../domain/shared/clock';

/**
 * CQRS Query Handler retrieving chronological appointment history and attendance compliance rates for a client.
 */
export class GetClientHistoryHandler implements QueryHandler<
  GetClientHistoryQuery,
  ApplicationResult<ClientHistoryDTO>
> {
  constructor(
    private readonly calendarReadRepository?: CalendarReadRepository,
    private readonly appointmentRepository?: AppointmentRepository,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  public async execute(query: GetClientHistoryQuery): Promise<ApplicationResult<ClientHistoryDTO>> {
    try {
      const { input } = query;

      // Delegate to read repository if present
      if (this.calendarReadRepository) {
        const dto = await this.calendarReadRepository.getClientHistory(input.clientId);
        return ApplicationResult.ok(dto);
      }

      if (!this.appointmentRepository) {
        return ApplicationResult.fail(
          'AppointmentRepository is required when CalendarReadRepository is omitted.',
        );
      }

      // Query past 2 years up to 1 year in future
      const now = this.clock.now();
      const pastStart = new Date(now.getTime() - 730 * 24 * 60 * 60 * 1000);
      const futureEnd = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
      const range = TimeRange.create(pastStart, futureEnd);

      const appointments = await this.appointmentRepository.findAppointmentsForClient(
        input.clientId,
        range,
      );

      // Sort chronologically
      const sortedAppointments = [...appointments].sort(
        (a, b) => a.timeRange.start.getTime() - b.timeRange.start.getTime(),
      );

      let completedCount = 0;
      let cancelledCount = 0;
      let noShowCount = 0;

      for (const appt of sortedAppointments) {
        if (appt.status === 'COMPLETED') completedCount++;
        else if (appt.status === 'CANCELLED') cancelledCount++;
        else if (appt.status === 'NO_SHOW') noShowCount++;
      }

      const totalBookings = sortedAppointments.length;
      const finishedBookings = completedCount + cancelledCount + noShowCount;

      const complianceRate =
        finishedBookings > 0 ? Number(((completedCount / finishedBookings) * 100).toFixed(1)) : 100;

      const mappedSlots = sortedAppointments.map((appt) =>
        CalendarGridMapper.mapAppointmentToSlot(appt),
      );

      const historyDTO: ClientHistoryDTO = {
        clientId: input.clientId,
        clientName: `Client ${input.clientId}`,
        totalBookings,
        completedCount,
        cancelledCount,
        noShowCount,
        complianceRate,
        appointments: mappedSlots,
      };

      return ApplicationResult.ok(historyDTO);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return ApplicationResult.fail(message);
    }
  }
}
