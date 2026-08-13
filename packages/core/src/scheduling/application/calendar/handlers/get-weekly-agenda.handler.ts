import { QueryHandler } from '../../shared/query-handler.interface';
import { ApplicationResult } from '../../shared/application-result';
import { CalendarReadRepository } from '../repositories/calendar-read.repository';
import { WeeklyAgendaDTO } from '../dtos/weekly-agenda.dto';
import { GetWeeklyAgendaQuery } from '../queries/get-weekly-agenda.query';
import { CalendarProjectionService } from '../projections/calendar-projection.service';
import { AppointmentRepository } from '../../../domain/repositories/appointment.repository';
import { Clock, SystemClock } from '../../../domain/shared/clock';

/**
 * Normalizes any Date instance to the Monday 00:00:00.000 UTC start of that week.
 */
export function normalizeToStartOfWeek(date: Date): Date {
  const utcYear = date.getUTCFullYear();
  const utcMonth = date.getUTCMonth();
  const utcDay = date.getUTCDate();
  const dayOfWeek = date.getUTCDay(); // 0=Sunday, 1=Monday... 6=Saturday

  // Calculate distance in days back to Monday (ISO week start)
  const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  return new Date(Date.UTC(utcYear, utcMonth, utcDay - diffToMonday, 0, 0, 0, 0));
}

/**
 * CQRS Query Handler retrieving 7-day weekly agenda view.
 * Normalizes input startDate to start-of-week (Monday 00:00 UTC).
 */
export class GetWeeklyAgendaHandler implements QueryHandler<
  GetWeeklyAgendaQuery,
  ApplicationResult<WeeklyAgendaDTO>
> {
  private readonly projectionService: CalendarProjectionService;

  constructor(
    private readonly calendarReadRepository?: CalendarReadRepository,
    appointmentRepository?: AppointmentRepository,
    clock: Clock = new SystemClock(),
  ) {
    this.projectionService = new CalendarProjectionService(clock, appointmentRepository);
  }

  public async execute(query: GetWeeklyAgendaQuery): Promise<ApplicationResult<WeeklyAgendaDTO>> {
    try {
      const { input } = query;
      const rawDate =
        typeof input.startDate === 'string' ? new Date(input.startDate) : input.startDate;

      if (isNaN(rawDate.getTime())) {
        return ApplicationResult.fail('Invalid startDate provided for weekly agenda query.');
      }

      // Normalize to Monday 00:00:00.000 UTC
      const normalizedStart = normalizeToStartOfWeek(rawDate);

      // Delegate to read repository if available
      if (this.calendarReadRepository) {
        const agenda = await this.calendarReadRepository.getWeeklyAgenda(
          normalizedStart,
          input.therapistId,
          input.roomId,
        );
        return ApplicationResult.ok(agenda);
      }

      // Fall back to projection service using domain repositories
      const agenda = await this.projectionService.fetchAndProjectWeeklyAgenda(
        normalizedStart,
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
