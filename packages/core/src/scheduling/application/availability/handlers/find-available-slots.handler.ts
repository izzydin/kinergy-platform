import { QueryHandler } from '../../shared/query-handler.interface';
import { ApplicationResult } from '../../shared/application-result';
import { FindAvailableSlotsQuery } from '../queries/find-available-slots.query';
import { SlotResponseDTO } from '../dtos/slot-response.dto';
import { SlotFinderEngine } from '../../../domain/services/slot-finder.engine';
import { SlotSearchQuery } from '../../../domain/services/dtos/slot-search-query.vo';
import { Duration } from '../../../domain/value-objects/duration.vo';
import { AppointmentType } from '../../../domain/value-objects/appointment-type.vo';
import { Clock } from '../../../domain/shared/clock';

/**
 * Query Handler for FindAvailableSlotsQuery discovering open booking slots.
 */
export class FindAvailableSlotsHandler implements QueryHandler<
  FindAvailableSlotsQuery,
  ApplicationResult<SlotResponseDTO[]>
> {
  constructor(
    private readonly slotEngine: SlotFinderEngine,
    private readonly clock: Clock,
  ) {}

  public async execute(
    query: FindAvailableSlotsQuery,
  ): Promise<ApplicationResult<SlotResponseDTO[]>> {
    try {
      const { input } = query;
      const now = this.clock.now();
      const effectiveStartDate = input.startDate.getTime() < now.getTime() ? now : input.startDate;

      if (effectiveStartDate.getTime() >= input.endDate.getTime()) {
        return ApplicationResult.ok([]);
      }

      const appointmentType = input.serviceType
        ? AppointmentType.create(input.serviceType)
        : undefined;

      const domainQuery = new SlotSearchQuery({
        therapistId: input.therapistId,
        roomId: input.roomId,
        duration: Duration.fromMinutes(input.durationMinutes),
        startDate: effectiveStartDate,
        endDate: input.endDate,
        appointmentType,
        stepIntervalMinutes: input.stepIntervalMinutes,
      });

      const slots = await this.slotEngine.findAvailableSlots(domainQuery);

      const dtos: SlotResponseDTO[] = slots.map((s) => ({
        startTime: s.timeRange.start.toISOString(),
        endTime: s.timeRange.end.toISOString(),
        therapistId: s.therapistId,
        roomId: s.roomId,
        available: true,
        score: s.score,
      }));

      return ApplicationResult.ok(dtos);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to search available slots.';
      return ApplicationResult.fail(errorMsg);
    }
  }
}
