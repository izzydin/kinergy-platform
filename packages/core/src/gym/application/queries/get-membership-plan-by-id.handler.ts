import { QueryHandler } from '../shared/query-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { GetMembershipPlanByIdQuery } from './get-membership-plan-by-id.query';
import { MembershipPlanDTO } from '../dtos/membership-plan.dto';
import { MembershipPlanMapper } from '../mappers/membership-plan.mapper';
import { MembershipPlanRepository } from '../../domain/repositories/membership-plan.repository';

export class GetMembershipPlanByIdHandler implements QueryHandler<
  GetMembershipPlanByIdQuery,
  ApplicationResult<MembershipPlanDTO>
> {
  constructor(private readonly planRepository: MembershipPlanRepository) {}

  public async execute(
    query: GetMembershipPlanByIdQuery,
  ): Promise<ApplicationResult<MembershipPlanDTO>> {
    try {
      const { input } = query;
      if (!input.planId || input.planId.trim().length === 0) {
        return ApplicationResult.fail('Plan ID cannot be empty.');
      }

      const plan = await this.planRepository.findById(input.planId.trim());
      if (!plan) {
        return ApplicationResult.fail(`Membership plan with ID '${input.planId}' not found.`);
      }

      return ApplicationResult.ok(MembershipPlanMapper.toDTO(plan));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return ApplicationResult.fail(message);
    }
  }
}
