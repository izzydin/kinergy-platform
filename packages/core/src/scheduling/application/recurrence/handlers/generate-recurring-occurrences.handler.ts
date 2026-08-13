import { CommandHandler } from '../../shared/command-handler.interface';
import { ApplicationResult } from '../../shared/application-result';
import { GenerateRecurringOccurrencesCommand } from '../commands/generate-recurring-occurrences.command';
import {
  OccurrenceGenerationResultDTO,
  ConflictingOccurrenceDiagnostic,
} from '../dtos/occurrence-generation-result.dto';
import { AppointmentDTO } from '../../appointment/dtos/appointment.dto';
import { AppointmentMapper } from '../../appointment/mappers/appointment.mapper';
import { RecurrenceSeriesRepository } from '../../../domain/repositories/recurrence-series.repository';
import { AppointmentRepository } from '../../../domain/repositories/appointment.repository';
import { ConflictDetectionService } from '../../../domain/services/conflict-detection.service';
import { RecurrenceCalculationEngine } from '../../../domain/recurrence/services/recurrence-calculation.engine';
import { SeriesStatus } from '../../../domain/recurrence/value-objects/series-status.enum';
import { AppointmentType } from '../../../domain/value-objects/appointment-type.vo';
import { AppointmentStatus } from '../../../domain/value-objects/appointment-status.enum';
import { TimeRange } from '../../../domain/value-objects/time-range.vo';
import { Appointment } from '../../../domain/appointment/appointment.aggregate';
import { Clock, SystemClock } from '../../../domain/shared/clock';

export class GenerateRecurringOccurrencesHandler implements CommandHandler<
  GenerateRecurringOccurrencesCommand,
  ApplicationResult<OccurrenceGenerationResultDTO>
> {
  private static readonly DEFAULT_HORIZON_DAYS = 60;
  private static readonly MAX_HORIZON_DAYS = 90;

  constructor(
    private readonly recurrenceSeriesRepository: RecurrenceSeriesRepository,
    private readonly appointmentRepository: AppointmentRepository,
    private readonly conflictDetectionService: ConflictDetectionService,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  public async execute(
    command: GenerateRecurringOccurrencesCommand,
  ): Promise<ApplicationResult<OccurrenceGenerationResultDTO>> {
    try {
      const { input } = command;

      // 1. Load & Validate RecurrenceSeries
      const series = await this.recurrenceSeriesRepository.findById(input.seriesId);
      if (!series) {
        return ApplicationResult.fail(`Recurrence series '${input.seriesId}' was not found.`);
      }

      if (series.status !== SeriesStatus.ACTIVE) {
        return ApplicationResult.fail(
          `Cannot generate occurrences for non-active recurrence series (Status: '${series.status}').`,
        );
      }

      // 2. Resolve Temporal Generation Window
      const now = this.clock.now();
      const horizonDays = Math.min(
        input.horizonDays ?? GenerateRecurringOccurrencesHandler.DEFAULT_HORIZON_DAYS,
        GenerateRecurringOccurrencesHandler.MAX_HORIZON_DAYS,
      );

      const wStart = input.windowStart
        ? new Date(input.windowStart)
        : new Date(Math.max(series.pattern.startDate.getTime(), now.getTime()));

      const wEnd = input.windowEnd
        ? new Date(input.windowEnd)
        : new Date(wStart.getTime() + horizonDays * 24 * 60 * 60 * 1000);

      const window = TimeRange.create(wStart, wEnd);

      // 3. Deterministically Calculate Occurrence Slots
      const calculationResult = RecurrenceCalculationEngine.calculate({
        seriesId: series.id.toString(),
        pattern: series.pattern,
        window,
        exceptions: series.exceptions,
      });

      // 4. Idempotency Check: Detect Existing Materialized Occurrences
      let existingAppointments: Appointment[] = [];
      if (this.appointmentRepository.findBySeriesId) {
        existingAppointments = await this.appointmentRepository.findBySeriesId(
          series.id.toString(),
        );
      } else {
        existingAppointments = await this.appointmentRepository.findAppointmentsByRange(window, {
          clientId: series.clientId,
          seriesId: series.id.toString(),
        });
      }

      const existingOccurrenceIndices = new Set<number>(
        existingAppointments
          .filter(
            (appt) =>
              appt.seriesId === series.id.toString() &&
              appt.status !== AppointmentStatus.CANCELLED &&
              appt.occurrenceIndex !== undefined,
          )
          .map((appt) => appt.occurrenceIndex!),
      );

      // 5. Occurrence-Level Evaluation & Conflict Pipeline
      const generatedAppointments: AppointmentDTO[] = [];
      const conflictingOccurrences: ConflictingOccurrenceDiagnostic[] = [];
      let generatedCount = 0;
      let skippedCount = 0;
      let conflictCount = 0;
      let existingCount = 0;

      const apptType = AppointmentType.create(series.serviceType);

      for (const slot of calculationResult.slots) {
        // Handle skipped exceptions
        if (slot.isSkipped) {
          skippedCount++;
          continue;
        }

        // Idempotency: Skip already materialized occurrence index
        if (existingOccurrenceIndices.has(slot.occurrenceIndex)) {
          existingCount++;
          continue;
        }

        // 4D Conflict Detection
        const conflicts = await this.conflictDetectionService.detectConflicts({
          therapistId: series.therapistId,
          roomId: series.roomId,
          clientId: series.clientId,
          requestedRange: slot.timeRange,
          appointmentType: apptType,
        });

        if (conflicts.length > 0) {
          conflictCount++;
          conflictingOccurrences.push({
            occurrenceIndex: slot.occurrenceIndex,
            timeRange: {
              start: slot.timeRange.start.toISOString(),
              end: slot.timeRange.end.toISOString(),
            },
            conflicts: conflicts.map((c) => ({
              conflictType: c.category,
              message: c.reason,
              conflictingEntityId: c.conflictingEntityId,
            })),
          });
          continue;
        }

        // Create and Persist Individual Appointment Aggregate Root
        const appointment = Appointment.create(
          {
            clientId: series.clientId,
            therapistId: series.therapistId,
            roomId: series.roomId,
            type: apptType,
            timeRange: slot.timeRange,
            seriesId: series.id.toString(),
            occurrenceIndex: slot.occurrenceIndex,
          },
          this.clock,
        );

        await this.appointmentRepository.save(appointment);

        // Keep local existing indices updated within the batch
        existingOccurrenceIndices.add(slot.occurrenceIndex);

        generatedCount++;
        generatedAppointments.push(AppointmentMapper.toDTO(appointment));
      }

      const resultDTO: OccurrenceGenerationResultDTO = {
        seriesId: series.id.toString(),
        requestedWindow: {
          start: window.start.toISOString(),
          end: window.end.toISOString(),
        },
        generatedCount,
        skippedCount,
        conflictCount,
        existingCount,
        isSeriesCompleted: calculationResult.isSeriesCompleted,
        generatedAppointments,
        conflictingOccurrences,
      };

      return ApplicationResult.ok(resultDTO);
    } catch (error) {
      return ApplicationResult.fail(
        error instanceof Error ? error.message : 'Unexpected error during occurrence generation.',
      );
    }
  }
}
