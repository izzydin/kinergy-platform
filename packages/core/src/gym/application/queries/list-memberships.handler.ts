import { QueryHandler } from '../shared/query-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { ListMembershipsQuery } from './list-memberships.query';
import { PaginatedMembershipsDTO } from '../dtos/paginated-memberships.dto';
import { MembershipMapper } from '../mappers/membership.mapper';
import { MembershipRepository } from '../../domain/repositories/membership.repository';
import { Membership } from '../../domain/membership/membership.aggregate';

export class ListMembershipsHandler implements QueryHandler<
  ListMembershipsQuery,
  ApplicationResult<PaginatedMembershipsDTO>
> {
  private static readonly DEFAULT_PAGE = 1;
  private static readonly DEFAULT_LIMIT = 20;
  private static readonly MAX_LIMIT = 100;

  constructor(private readonly membershipRepository: MembershipRepository) {}

  public async execute(
    query: ListMembershipsQuery,
  ): Promise<ApplicationResult<PaginatedMembershipsDTO>> {
    try {
      const { filter } = query;

      const page = Math.max(1, filter.page ?? ListMembershipsHandler.DEFAULT_PAGE);
      const rawLimit = filter.limit ?? ListMembershipsHandler.DEFAULT_LIMIT;
      const limit = Math.min(ListMembershipsHandler.MAX_LIMIT, Math.max(1, rawLimit));

      let allMemberships: Membership[];
      if (filter.clientId) {
        allMemberships = await this.membershipRepository.findByClientId(filter.clientId.trim());
      } else {
        allMemberships = await this.membershipRepository.findAll();
      }

      // Filter in-memory when querying through base repository contract
      let filtered = allMemberships;

      if (filter.planId) {
        const planIdTrimmed = filter.planId.trim();
        filtered = filtered.filter((m) => m.planId === planIdTrimmed);
      }

      if (filter.status) {
        const statusUpper = filter.status.trim().toUpperCase();
        filtered = filtered.filter((m) => m.status === statusUpper);
      }

      if (filter.startDateFrom) {
        const from = new Date(filter.startDateFrom);
        if (!isNaN(from.getTime())) {
          filtered = filtered.filter((m) => m.period.startDate.getTime() >= from.getTime());
        }
      }

      if (filter.startDateTo) {
        const to = new Date(filter.startDateTo);
        if (!isNaN(to.getTime())) {
          filtered = filtered.filter((m) => m.period.startDate.getTime() <= to.getTime());
        }
      }

      if (filter.endDateFrom) {
        const from = new Date(filter.endDateFrom);
        if (!isNaN(from.getTime())) {
          filtered = filtered.filter((m) => m.period.endDate.getTime() >= from.getTime());
        }
      }

      if (filter.endDateTo) {
        const to = new Date(filter.endDateTo);
        if (!isNaN(to.getTime())) {
          filtered = filtered.filter((m) => m.period.endDate.getTime() <= to.getTime());
        }
      }

      // Deterministic sort: period.startDate DESC, id ASC (tie-breaker)
      filtered.sort((a, b) => {
        const diff = b.period.startDate.getTime() - a.period.startDate.getTime();
        if (diff !== 0) return diff;
        return a.id.value.localeCompare(b.id.value);
      });

      const total = filtered.length;
      const totalPages = Math.ceil(total / limit) || 1;
      const startIndex = (page - 1) * limit;
      const paginatedSlice = filtered.slice(startIndex, startIndex + limit);

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
