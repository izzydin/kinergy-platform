import { QueryHandler } from '../shared/query-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { ListMembershipPlansQuery } from './list-membership-plans.query';
import { MembershipPlanDTO } from '../dtos/membership-plan.dto';
import { MembershipPlanMapper } from '../mappers/membership-plan.mapper';
import { MembershipPlanRepository } from '../../domain/repositories/membership-plan.repository';
import { MembershipPlan } from '../../domain/plan/membership-plan.aggregate';

export class ListMembershipPlansHandler implements QueryHandler<
  ListMembershipPlansQuery,
  ApplicationResult<MembershipPlanDTO[]>
> {
  constructor(private readonly planRepository: MembershipPlanRepository) {}

  public async execute(
    query: ListMembershipPlansQuery,
  ): Promise<ApplicationResult<MembershipPlanDTO[]>> {
    try {
      const { input } = query;

      let plans: MembershipPlan[];
      if (input.activeOnly) {
        plans = await this.planRepository.findActive();
      } else if (this.planRepository.findAll) {
        plans = await this.planRepository.findAll();
      } else {
        plans = await this.planRepository.findActive();
      }

      const dtos = plans.map((p) => MembershipPlanMapper.toDTO(p));
      return ApplicationResult.ok(dtos);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return ApplicationResult.fail(message);
    }
  }
}
