import { QueryHandler } from '../../shared/query-handler.interface';
import { ApplicationResult } from '../../shared/application-result';
import { CalendarReadRepository } from '../repositories/calendar-read.repository';
import { DailyAgendaDTO } from '../dtos/daily-agenda.dto';
import { GetDailyAgendaQuery } from '../queries/get-daily-agenda.query';
import { CalendarProjectionService } from '../projections/calendar-projection.service';
import { AppointmentRepository } from '../../../domain/repositories/appointment.repository';
import { Clock, SystemClock } from '../../../domain/shared/clock';

/**
 * CQRS Query Handler retrieving full daily agenda grid view for reception and staff interfaces.
 */
export class GetDailyAgendaHandler implements QueryHandler<
  GetDailyAgendaQuery,
  ApplicationResult<DailyAgendaDTO>
> {
  private readonly projectionService: CalendarProjectionService;

  constructor(
    private readonly calendarReadRepository?: CalendarReadRepository,
    appointmentRepository?: AppointmentRepository,
    clock: Clock = new SystemClock(),
  ) {
    this.projectionService = new CalendarProjectionService(clock, appointmentRepository);
  }

  public async execute(query: GetDailyAgendaQuery): Promise<ApplicationResult<DailyAgendaDTO>> {
    try {
      const { input } = query;
      const targetDate = typeof input.date === 'string' ? new Date(input.date) : input.date;

      if (isNaN(targetDate.getTime())) {
        return ApplicationResult.fail('Invalid target date provided for daily agenda query.');
      }

      // If dedicated read repository port is provided, delegate to read model
      if (this.calendarReadRepository) {
        const agenda = await this.calendarReadRepository.getDailyAgenda(
          targetDate,
          input.therapistId,
          input.roomId,
        );
        return ApplicationResult.ok(agenda);
      }

      // Fall back to projection service using domain repositories
      const agenda = await this.projectionService.fetchAndProjectDailyAgenda(
        targetDate,
        input.therapistId,
        input.roomId,
        input.timezone,
      );

      return ApplicationResult.ok(agenda);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return ApplicationResult.fail(message);
    }
  }
}
