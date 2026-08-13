import { CommandHandler } from '../../shared/command-handler.interface';
import { ApplicationResult } from '../../shared/application-result';
import { CancelRecurrenceSeriesCommand } from '../commands/cancel-recurrence-series.command';
import { RecurrenceSeriesRepository } from '../../../domain/repositories/recurrence-series.repository';
import { AppointmentRepository } from '../../../domain/repositories/appointment.repository';
import { Appointment } from '../../../domain/appointment/appointment.aggregate';
import { TimeRange } from '../../../domain/value-objects/time-range.vo';
import { AppointmentStatus } from '../../../domain/value-objects/appointment-status.enum';
import { Clock, SystemClock } from '../../../domain/shared/clock';

export interface CancelRecurrenceSeriesResultDTO {
  readonly seriesId: string;
  readonly reason: string;
  readonly cancelledAppointmentsCount: number;
}

export class CancelRecurrenceSeriesHandler implements CommandHandler<
  CancelRecurrenceSeriesCommand,
  ApplicationResult<CancelRecurrenceSeriesResultDTO>
> {
  constructor(
    private readonly recurrenceSeriesRepository: RecurrenceSeriesRepository,
    private readonly appointmentRepository: AppointmentRepository,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  public async execute(
    command: CancelRecurrenceSeriesCommand,
  ): Promise<ApplicationResult<CancelRecurrenceSeriesResultDTO>> {
    try {
      const { seriesId, reason, cancelFutureMaterialized = true } = command.input;

      // 1. Load Series Aggregate
      const series = await this.recurrenceSeriesRepository.findById(seriesId);
      if (!series) {
        return ApplicationResult.fail(`Recurrence series '${seriesId}' was not found.`);
      }

      // 2. Cancel Series Aggregate
      series.cancel(reason, this.clock);
      await this.recurrenceSeriesRepository.save(series);

      // 3. Cancel Materialized Future Appointments (Preserve past and detached)
      let cancelledAppointmentsCount = 0;
      if (cancelFutureMaterialized) {
        const now = this.clock.now();
        let appts: Appointment[] = [];
        if (this.appointmentRepository.findBySeriesId) {
          appts = await this.appointmentRepository.findBySeriesId(series.id.toString());
        } else {
          appts = await this.appointmentRepository.findAppointmentsForClient(
            series.clientId,
            TimeRange.create(now, new Date('2100-01-01T00:00:00.000Z')),
          );
        }

        for (const appt of appts) {
          const isTargetAppt =
            appt.seriesId === series.id.toString() &&
            !appt.isDetachedFromSeries &&
            appt.timeRange.start.getTime() >= now.getTime() &&
            (appt.status === AppointmentStatus.SCHEDULED ||
              appt.status === AppointmentStatus.CONFIRMED);

          if (isTargetAppt) {
            appt.cancel(reason, this.clock);
            await this.appointmentRepository.save(appt);
            cancelledAppointmentsCount++;
          }
        }
      }

      return ApplicationResult.ok({
        seriesId: series.id.toString(),
        reason,
        cancelledAppointmentsCount,
      });
    } catch (error) {
      return ApplicationResult.fail(
        error instanceof Error ? error.message : 'Unexpected error cancelling recurrence series.',
      );
    }
  }
}
