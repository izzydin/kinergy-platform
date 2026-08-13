import { CommandHandler } from '../../shared/command-handler.interface';
import { ApplicationResult } from '../../shared/application-result';
import { CreateRecurrenceSeriesCommand } from '../commands/create-recurrence-series.command';
import { CreateRecurrenceSeriesResultDTO } from '../dtos/create-recurrence-series-result.dto';
import { RecurrenceSeriesMapper } from '../mappers/recurrence-series.mapper';
import { RecurrenceSeriesRepository } from '../../../domain/repositories/recurrence-series.repository';
import { RecurrenceSeries } from '../../../domain/recurrence/recurrence-series.aggregate';
import { RecurrencePattern } from '../../../domain/recurrence/value-objects/recurrence-pattern.vo';
import { RecurrenceFrequency } from '../../../domain/recurrence/value-objects/recurrence-frequency.enum';
import { AppointmentType } from '../../../domain/value-objects/appointment-type.vo';
import { GenerateRecurringOccurrencesHandler } from './generate-recurring-occurrences.handler';
import { GenerateRecurringOccurrencesCommand } from '../commands/generate-recurring-occurrences.command';
import { Clock, SystemClock } from '../../../domain/shared/clock';

export class CreateRecurrenceSeriesHandler implements CommandHandler<
  CreateRecurrenceSeriesCommand,
  ApplicationResult<CreateRecurrenceSeriesResultDTO>
> {
  constructor(
    private readonly recurrenceSeriesRepository: RecurrenceSeriesRepository,
    private readonly generationHandler: GenerateRecurringOccurrencesHandler,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  public async execute(
    command: CreateRecurrenceSeriesCommand,
  ): Promise<ApplicationResult<CreateRecurrenceSeriesResultDTO>> {
    try {
      const { input } = command;

      // 1. Validate Appointment / Service Type
      const apptType = AppointmentType.create(input.serviceType);

      // 2. Validate & Build RecurrencePattern
      const frequency =
        typeof input.frequency === 'string'
          ? (input.frequency.toUpperCase() as RecurrenceFrequency)
          : input.frequency;

      const pattern = RecurrencePattern.create({
        frequency,
        startDate: new Date(input.startDate),
        endDate: input.endDate ? new Date(input.endDate) : undefined,
        maxOccurrences: input.maxOccurrences,
        localStartTime: input.localStartTime,
        durationMinutes: input.durationMinutes,
        timezone: input.timezone ?? this.clock.timezone(),
      });

      // 3. Create RecurrenceSeries Aggregate Root
      const series = RecurrenceSeries.create(
        {
          pattern,
          clientId: input.clientId,
          therapistId: input.therapistId,
          roomId: input.roomId,
          serviceType: apptType.getValue(),
        },
        this.clock,
      );

      // 4. Persist RecurrenceSeries Aggregate
      await this.recurrenceSeriesRepository.save(series);

      // 5. Generate Initial Rolling Window Occurrences
      const genResult = await this.generationHandler.execute(
        new GenerateRecurringOccurrencesCommand({
          seriesId: series.id.toString(),
          horizonDays: input.horizonDays,
        }),
      );

      if (!genResult.isSuccess) {
        return ApplicationResult.fail(
          `Series created but initial generation failed: ${genResult.getError()}`,
        );
      }

      // 6. Return Structured Result DTO
      return ApplicationResult.ok({
        series: RecurrenceSeriesMapper.toDTO(series),
        initialGeneration: genResult.getValue(),
      });
    } catch (error) {
      return ApplicationResult.fail(
        error instanceof Error ? error.message : 'Unexpected error creating recurrence series.',
      );
    }
  }
}
