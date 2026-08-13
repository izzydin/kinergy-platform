import { CommandHandler } from '../../shared/command-handler.interface';
import { ApplicationResult } from '../../shared/application-result';
import { EditFutureOccurrencesCommand } from '../commands/edit-future-occurrences.command';
import { RecurrenceSeriesRepository } from '../../../domain/repositories/recurrence-series.repository';
import { AppointmentRepository } from '../../../domain/repositories/appointment.repository';
import { Appointment } from '../../../domain/appointment/appointment.aggregate';
import { TimeRange } from '../../../domain/value-objects/time-range.vo';
import { RecurrenceSeries } from '../../../domain/recurrence/recurrence-series.aggregate';
import { RecurrencePattern } from '../../../domain/recurrence/value-objects/recurrence-pattern.vo';
import { SeriesStatus } from '../../../domain/recurrence/value-objects/series-status.enum';
import { AppointmentStatus } from '../../../domain/value-objects/appointment-status.enum';
import { GenerateRecurringOccurrencesHandler } from './generate-recurring-occurrences.handler';
import { GenerateRecurringOccurrencesCommand } from '../commands/generate-recurring-occurrences.command';
import { Clock, SystemClock } from '../../../domain/shared/clock';

export interface EditFutureOccurrencesResultDTO {
  readonly oldSeriesId: string;
  readonly newSeriesId: string;
  readonly cutoffDate: string;
  readonly cancelledAppointmentsCount: number;
  readonly newSeriesGeneratedCount: number;
}

export class EditFutureOccurrencesHandler implements CommandHandler<
  EditFutureOccurrencesCommand,
  ApplicationResult<EditFutureOccurrencesResultDTO>
> {
  constructor(
    private readonly recurrenceSeriesRepository: RecurrenceSeriesRepository,
    private readonly appointmentRepository: AppointmentRepository,
    private readonly generationHandler: GenerateRecurringOccurrencesHandler,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  public async execute(
    command: EditFutureOccurrencesCommand,
  ): Promise<ApplicationResult<EditFutureOccurrencesResultDTO>> {
    try {
      const {
        seriesId,
        fromOccurrenceIndex,
        fromDate,
        newFrequency,
        newLocalStartTime,
        newDurationMinutes,
        newTherapistId,
        newRoomId,
        newServiceType,
        newEndDate,
        newMaxOccurrences,
        reason,
      } = command.input;

      // 1. Load Existing RecurrenceSeries
      const existingSeries = await this.recurrenceSeriesRepository.findById(seriesId);
      if (!existingSeries) {
        return ApplicationResult.fail(`Recurrence series '${seriesId}' was not found.`);
      }

      if (existingSeries.status !== SeriesStatus.ACTIVE) {
        return ApplicationResult.fail(
          `Cannot edit future occurrences of non-active series (Status: '${existingSeries.status}').`,
        );
      }

      // 2. Capture Original Pattern Values before termination
      const originalPatternVal = existingSeries.pattern.getValue();
      const cutoff = new Date(fromDate);

      // 3. Cutoff Existing Series S1
      existingSeries.terminateAt(cutoff, this.clock);
      await this.recurrenceSeriesRepository.save(existingSeries);

      // 4. Cancel Materialized Future Appointments for S1 (Preserve past and detached appointments)
      let existingAppts: Appointment[] = [];
      if (this.appointmentRepository.findBySeriesId) {
        existingAppts = await this.appointmentRepository.findBySeriesId(
          existingSeries.id.toString(),
        );
      } else {
        existingAppts = await this.appointmentRepository.findAppointmentsForClient(
          existingSeries.clientId,
          TimeRange.create(cutoff, new Date('2100-01-01T00:00:00.000Z')),
        );
      }

      let cancelledCount = 0;
      for (const appt of existingAppts) {
        const isTargetAppt =
          appt.seriesId === existingSeries.id.toString() &&
          !appt.isDetachedFromSeries &&
          appt.timeRange.start.getTime() >= cutoff.getTime() &&
          (appt.status === AppointmentStatus.SCHEDULED ||
            appt.status === AppointmentStatus.CONFIRMED);

        if (isTargetAppt) {
          appt.cancel(
            reason ?? 'Cancelled due to future recurrence series modification',
            this.clock,
          );
          await this.appointmentRepository.save(appt);
          cancelledCount++;
        }
      }

      // 5. Fork / Instantiate New RecurrenceSeries S2 starting at Cutoff Date
      const resolvedEndDate = newEndDate
        ? new Date(newEndDate)
        : originalPatternVal.endDate && originalPatternVal.endDate.getTime() > cutoff.getTime()
          ? originalPatternVal.endDate
          : undefined;

      const newPattern = RecurrencePattern.create({
        frequency: newFrequency ?? originalPatternVal.frequency,
        startDate: cutoff,
        endDate: resolvedEndDate,
        maxOccurrences:
          newMaxOccurrences !== undefined
            ? newMaxOccurrences
            : originalPatternVal.maxOccurrences
              ? Math.max(1, originalPatternVal.maxOccurrences - fromOccurrenceIndex)
              : undefined,
        localStartTime: newLocalStartTime ?? originalPatternVal.localStartTime,
        durationMinutes: newDurationMinutes ?? originalPatternVal.durationMinutes,
        timezone: originalPatternVal.timezone,
      });

      const newSeries = RecurrenceSeries.create(
        {
          pattern: newPattern,
          clientId: existingSeries.clientId,
          therapistId: newTherapistId ?? existingSeries.therapistId,
          roomId: newRoomId ?? existingSeries.roomId,
          serviceType: newServiceType ?? existingSeries.serviceType,
        },
        this.clock,
      );

      await this.recurrenceSeriesRepository.save(newSeries);

      // 6. Generate Occurrences for New Series S2
      const genResult = await this.generationHandler.execute(
        new GenerateRecurringOccurrencesCommand({
          seriesId: newSeries.id.toString(),
          windowStart: cutoff,
        }),
      );

      const newSeriesGeneratedCount = genResult.isSuccess ? genResult.getValue().generatedCount : 0;

      return ApplicationResult.ok({
        oldSeriesId: existingSeries.id.toString(),
        newSeriesId: newSeries.id.toString(),
        cutoffDate: cutoff.toISOString(),
        cancelledAppointmentsCount: cancelledCount,
        newSeriesGeneratedCount,
      });
    } catch (error) {
      return ApplicationResult.fail(
        error instanceof Error ? error.message : 'Unexpected error editing future occurrences.',
      );
    }
  }
}
