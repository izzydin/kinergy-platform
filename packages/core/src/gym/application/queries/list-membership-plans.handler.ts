import { QueryHandler } from '../shared/query-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { ListMembershipPlansQuery } from './list-membership-plans.query';
import { PaginatedMembershipPlansDTO } from '../dtos/paginated-membership-plans.dto';
import { MembershipPlanMapper } from '../mappers/membership-plan.mapper';
import { MembershipPlanRepository } from '../../domain/repositories/membership-plan.repository';
import { MembershipPlan } from '../../domain/plan/membership-plan.aggregate';
import { PlanStatus } from '../../domain/plan/plan-status.enum';

export class ListMembershipPlansHandler implements QueryHandler<
  ListMembershipPlansQuery,
  ApplicationResult<PaginatedMembershipPlansDTO>
> {
  private static readonly DEFAULT_PAGE = 1;
  private static readonly DEFAULT_LIMIT = 20;
  private static readonly MAX_LIMIT = 100;

  constructor(private readonly planRepository: MembershipPlanRepository) {}

  public async execute(
    query: ListMembershipPlansQuery,
  ): Promise<ApplicationResult<PaginatedMembershipPlansDTO>> {
    try {
      const { filter } = query;

      const page = Math.max(1, filter.page ?? ListMembershipPlansHandler.DEFAULT_PAGE);
      const rawLimit = filter.limit ?? ListMembershipPlansHandler.DEFAULT_LIMIT;
      const limit = Math.min(ListMembershipPlansHandler.MAX_LIMIT, Math.max(1, rawLimit));

      let allPlans: MembershipPlan[];
      if (filter.activeOnly) {
        allPlans = await this.planRepository.findActive();
      } else if (this.planRepository.findAll) {
        allPlans = await this.planRepository.findAll();
      } else {
        allPlans = await this.planRepository.findActive();
      }

      let filtered = allPlans;

      if (filter.status) {
        const statusUpper = filter.status.trim().toUpperCase();
        filtered = filtered.filter((p) => p.status === statusUpper);
      }

      if (filter.search) {
        const searchLower = filter.search.trim().toLowerCase();
        filtered = filtered.filter(
          (p) =>
            p.name.toLowerCase().includes(searchLower) ||
            p.code.value.toLowerCase().includes(searchLower) ||
            (p.description && p.description.toLowerCase().includes(searchLower)),
        );
      }

      // Deterministic sort: status ACTIVE first, then createdAt DESC, then id ASC
      filtered.sort((a, b) => {
        if (a.status === PlanStatus.ACTIVE && b.status !== PlanStatus.ACTIVE) return -1;
        if (b.status === PlanStatus.ACTIVE && a.status !== PlanStatus.ACTIVE) return 1;

        const diff = b.createdAt.getTime() - a.createdAt.getTime();
        if (diff !== 0) return diff;
        return a.id.value.localeCompare(b.id.value);
      });

      const total = filtered.length;
      const totalPages = Math.ceil(total / limit) || 1;
      const startIndex = (page - 1) * limit;
      const paginatedSlice = filtered.slice(startIndex, startIndex + limit);

      const items = paginatedSlice.map((p) => MembershipPlanMapper.toDTO(p));

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
