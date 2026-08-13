import { CommandHandler } from '../../shared/command-handler.interface';
import { ApplicationResult } from '../../shared/application-result';
import { SkipRecurrenceOccurrenceCommand } from '../commands/skip-recurrence-occurrence.command';
import { RecurrenceSeriesRepository } from '../../../domain/repositories/recurrence-series.repository';
import { AppointmentRepository } from '../../../domain/repositories/appointment.repository';
import { Appointment } from '../../../domain/appointment/appointment.aggregate';
import { TimeRange } from '../../../domain/value-objects/time-range.vo';
import { SeriesStatus } from '../../../domain/recurrence/value-objects/series-status.enum';
import { AppointmentStatus } from '../../../domain/value-objects/appointment-status.enum';
import { Clock, SystemClock } from '../../../domain/shared/clock';

export interface SkipRecurrenceOccurrenceResultDTO {
  readonly seriesId: string;
  readonly occurrenceIndex: number;
  readonly date: string;
  readonly isNewlySkipped: boolean;
  readonly cancelledAppointmentId?: string;
}

export class SkipRecurrenceOccurrenceHandler implements CommandHandler<
  SkipRecurrenceOccurrenceCommand,
  ApplicationResult<SkipRecurrenceOccurrenceResultDTO>
> {
  constructor(
    private readonly recurrenceSeriesRepository: RecurrenceSeriesRepository,
    private readonly appointmentRepository: AppointmentRepository,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  public async execute(
    command: SkipRecurrenceOccurrenceCommand,
  ): Promise<ApplicationResult<SkipRecurrenceOccurrenceResultDTO>> {
    try {
      const { seriesId, occurrenceIndex, reason } = command.input;

      const series = await this.recurrenceSeriesRepository.findById(seriesId);
      if (!series) {
        return ApplicationResult.fail(`Recurrence series '${seriesId}' was not found.`);
      }

      if (series.status !== SeriesStatus.ACTIVE) {
        return ApplicationResult.fail(
          `Cannot skip occurrence on non-active recurrence series (Status: '${series.status}').`,
        );
      }

      // Determine occurrence date
      const occurrenceDates = series.pattern.generateOccurrenceDates(
        undefined,
        occurrenceIndex + 1,
      );
      const targetDate = command.input.date
        ? new Date(command.input.date)
        : (occurrenceDates[occurrenceIndex] ?? new Date());

      // 1. Idempotently skip on series aggregate
      const isNewlySkipped = series.skipOccurrence(
        occurrenceIndex,
        targetDate,
        reason ?? 'Skipped by user request',
        this.clock,
      );

      await this.recurrenceSeriesRepository.save(series);

      // 2. Cancel already materialized appointment if present
      let cancelledAppointmentId: string | undefined;
      let existingAppts: Appointment[] = [];
      if (this.appointmentRepository.findBySeriesId) {
        existingAppts = await this.appointmentRepository.findBySeriesId(series.id.toString());
      } else {
        existingAppts = await this.appointmentRepository.findAppointmentsForClient(
          series.clientId,
          TimeRange.create(series.pattern.startDate, new Date('2100-01-01T00:00:00.000Z')),
        );
      }

      const matchingAppt = existingAppts.find(
        (a) =>
          a.seriesId === series.id.toString() &&
          a.occurrenceIndex === occurrenceIndex &&
          a.status !== AppointmentStatus.CANCELLED,
      );

      if (matchingAppt) {
        matchingAppt.cancel(reason ?? 'Skipped by recurrence series exception', this.clock);
        await this.appointmentRepository.save(matchingAppt);
        cancelledAppointmentId = matchingAppt.id.getValue();
      }

      return ApplicationResult.ok({
        seriesId: series.id.toString(),
        occurrenceIndex,
        date: targetDate.toISOString(),
        isNewlySkipped,
        cancelledAppointmentId,
      });
    } catch (error) {
      return ApplicationResult.fail(
        error instanceof Error ? error.message : 'Unexpected error during skipping occurrence.',
      );
    }
  }
}
