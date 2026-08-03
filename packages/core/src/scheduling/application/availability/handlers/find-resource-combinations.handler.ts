import { QueryHandler } from '../../shared/query-handler.interface';
import { ApplicationResult } from '../../shared/application-result';
import { FindResourceCombinationsQuery } from '../queries/find-resource-combinations.query';
import { ResourceCombinationResponseDTO } from '../dtos/slot-response.dto';
import { SlotFinderEngine } from '../../../domain/services/slot-finder.engine';
import { MultiResourceSlotSearchQuery } from '../../../domain/services/dtos/slot-search-query.vo';
import { Duration } from '../../../domain/value-objects/duration.vo';
import { Clock } from '../../../domain/shared/clock';

/**
 * Query Handler for FindResourceCombinationsQuery discovering multi-resource booking options.
 */
export class FindResourceCombinationsHandler implements QueryHandler<
  FindResourceCombinationsQuery,
  ApplicationResult<ResourceCombinationResponseDTO[]>
> {
  constructor(
    private readonly slotEngine: SlotFinderEngine,
    private readonly clock: Clock,
  ) {}

  public async execute(
    query: FindResourceCombinationsQuery,
  ): Promise<ApplicationResult<ResourceCombinationResponseDTO[]>> {
    try {
      const { input } = query;
      const now = this.clock.now();
      const effectiveStartDate = input.startDate.getTime() < now.getTime() ? now : input.startDate;

      if (effectiveStartDate.getTime() >= input.endDate.getTime()) {
        return ApplicationResult.ok([]);
      }

      const domainQuery = new MultiResourceSlotSearchQuery({
        therapistIds: input.therapistIds,
        roomIds: input.roomIds,
        requiredFeatures: input.requiredFeatures,
        requiredCapacity: input.requiredCapacity,
        duration: Duration.fromMinutes(input.durationMinutes),
        startDate: effectiveStartDate,
        endDate: input.endDate,
        stepIntervalMinutes: input.stepIntervalMinutes,
      });

      const combinations = await this.slotEngine.findCompatibleCombinations(domainQuery);

      const dtos: ResourceCombinationResponseDTO[] = combinations.map((c) => ({
        startTime: c.timeRange.start.toISOString(),
        endTime: c.timeRange.end.toISOString(),
        therapistId: c.therapistId,
        roomId: c.roomId,
      }));

      return ApplicationResult.ok(dtos);
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error ? err.message : 'Failed to search resource combinations.';
      return ApplicationResult.fail(errorMsg);
    }
  }
}
