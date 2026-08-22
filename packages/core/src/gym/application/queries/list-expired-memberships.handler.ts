import { QueryHandler } from '../shared/query-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { ListExpiredMembershipsQuery } from './list-expired-memberships.query';
import { PaginatedMembershipsDTO } from '../dtos/paginated-memberships.dto';
import { MembershipMapper } from '../mappers/membership.mapper';
import { MembershipRepository } from '../../domain/repositories/membership.repository';
import { MembershipStatus } from '../../domain/membership/membership-status.enum';

export class ListExpiredMembershipsHandler implements QueryHandler<
  ListExpiredMembershipsQuery,
  ApplicationResult<PaginatedMembershipsDTO>
> {
  private static readonly DEFAULT_PAGE = 1;
  private static readonly DEFAULT_LIMIT = 20;
  private static readonly MAX_LIMIT = 100;

  constructor(private readonly membershipRepository: MembershipRepository) {}

  public async execute(
    query: ListExpiredMembershipsQuery,
  ): Promise<ApplicationResult<PaginatedMembershipsDTO>> {
    try {
      const { filter } = query;

      const page = Math.max(1, filter.page ?? ListExpiredMembershipsHandler.DEFAULT_PAGE);
      const rawLimit = filter.limit ?? ListExpiredMembershipsHandler.DEFAULT_LIMIT;
      const limit = Math.min(ListExpiredMembershipsHandler.MAX_LIMIT, Math.max(1, rawLimit));

      const memberships = await this.membershipRepository.findAll();

      // Filter to only EXPIRED memberships
      let expired = memberships.filter((m) => m.status === MembershipStatus.EXPIRED);

      if (filter.clientId) {
        const clientTrimmed = filter.clientId.trim();
        expired = expired.filter((m) => m.clientId === clientTrimmed);
      }

      if (filter.expiredBefore) {
        const before = new Date(filter.expiredBefore);
        if (!isNaN(before.getTime())) {
          expired = expired.filter((m) => m.period.endDate.getTime() <= before.getTime());
        }
      }

      // Deterministic sort: period.endDate DESC, id ASC
      expired.sort((a, b) => {
        const diff = b.period.endDate.getTime() - a.period.endDate.getTime();
        if (diff !== 0) return diff;
        return a.id.value.localeCompare(b.id.value);
      });

      const total = expired.length;
      const totalPages = Math.ceil(total / limit) || 1;
      const startIndex = (page - 1) * limit;
      const paginatedSlice = expired.slice(startIndex, startIndex + limit);

      const items = paginatedSlice.map((m) => MembershipMapper.toDTO(m));

      return ApplicationResult.ok({
        items,
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return ApplicationResult.fail(message);
    }
  }
}
