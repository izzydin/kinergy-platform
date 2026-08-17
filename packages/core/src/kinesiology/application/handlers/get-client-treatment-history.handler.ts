import { QueryHandler } from '../shared/query-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { GetClientTreatmentHistoryQuery } from '../queries/get-client-treatment-history.query';
import { PaginatedTreatmentHistoryDTO } from '../dtos/treatment-history-summary.dto';
import { ITreatmentSessionRepository } from '../../domain/repositories/treatment-session.repository';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MIN_LIMIT = 1;
const MAX_LIMIT = 50;

/**
 * CQRS Query Handler retrieving a client's chronological treatment history.
 */
export class GetClientTreatmentHistoryHandler implements QueryHandler<
  GetClientTreatmentHistoryQuery,
  ApplicationResult<PaginatedTreatmentHistoryDTO>
> {
  constructor(private readonly sessionRepository: ITreatmentSessionRepository) {}

  public async execute(
    query: GetClientTreatmentHistoryQuery,
  ): Promise<ApplicationResult<PaginatedTreatmentHistoryDTO>> {
    try {
      const { clientId, status, therapistId, dateFrom, dateTo } = query.input;

      if (!clientId || clientId.trim().length === 0) {
        return ApplicationResult.fail('Client ID cannot be empty.');
      }

      // Safe pagination clamping
      const rawPage = query.input.page ?? DEFAULT_PAGE;
      const rawLimit = query.input.limit ?? DEFAULT_LIMIT;

      const page = Math.max(DEFAULT_PAGE, Math.floor(rawPage));
      const limit = Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, Math.floor(rawLimit)));

      // Date range validation
      if (dateFrom && dateTo && dateFrom > dateTo) {
        return ApplicationResult.fail('dateFrom cannot be greater than dateTo.');
      }

      const result = await this.sessionRepository.findHistoryByClientId(clientId.trim(), {
        status,
        therapistId,
        dateFrom,
        dateTo,
        pagination: {
          page,
          limit,
        },
      });

      return ApplicationResult.ok(result);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Unknown error during treatment history retrieval.';
      return ApplicationResult.fail(errorMessage);
    }
  }
}
